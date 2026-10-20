import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, App, Button, Checkbox, Flex, Input, Modal, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { userApi, type DeletionBlocker } from '../../api/userApi';
import { useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { apiErrorMessage } from '../../utils/apiError';

/**
 * Deleting your own account (Law 058/2021).
 *
 * The server says first whether anything is in the way (a job under way, money
 * owed either way, an open dispute); if so, those are listed with links and
 * nothing else is asked. Otherwise the person sees what goes and what stays,
 * confirms with their password, and is signed out.
 */
const DeleteAccount = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [blockers, setBlockers] = useState<DeletionBlocker[]>([]);
  const [password, setPassword] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setChecking(true);
    try {
      const result = await userApi.deletionCheck();
      setBlockers(result.blockers);
      setPassword('');
      setUnderstood(false);
      setOpen(true);
    } catch (err) {
      message.error(apiErrorMessage(err, t('deleteAccount.failed')));
    } finally {
      setChecking(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await userApi.deleteMe(password);
      setOpen(false);
      dispatch(logout());
      message.success(t('deleteAccount.done'));
      navigate('/login', { replace: true });
    } catch (err) {
      message.error(apiErrorMessage(err, t('deleteAccount.failed')));
    } finally {
      setBusy(false);
    }
  };

  const isAdmin = blockers.some((b) => b.code === 'admin');

  return (
    <Flex vertical gap={10}>
      <Typography.Text strong>{t('deleteAccount.title')}</Typography.Text>
      <Typography.Text type="secondary">{t('deleteAccount.intro')}</Typography.Text>
      <div>
        <Button danger icon={<DeleteOutlined />} loading={checking} onClick={start}>
          {t('deleteAccount.button')}
        </Button>
      </div>

      <Modal
        open={open}
        title={t('deleteAccount.title')}
        onCancel={() => setOpen(false)}
        onOk={confirm}
        okText={t('deleteAccount.confirm')}
        okButtonProps={{ danger: true, disabled: blockers.length > 0 || !understood || !password, loading: busy }}
        cancelText={t('common.cancel')}
        footer={blockers.length > 0 ? (_, { CancelBtn }) => <CancelBtn /> : undefined}
      >
        {isAdmin ? (
          <Alert type="info" showIcon message={t('deleteAccount.admin')} />
        ) : blockers.length > 0 ? (
          <Flex vertical gap={10}>
            <Typography.Text>{t('deleteAccount.blocked')}</Typography.Text>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {blockers.map((b) =>
                b.code === 'admin' ? null : (
                  <li key={`${b.code}-${b.gigId}`} style={{ marginBottom: 6 }}>
                    <Link to={`/gigs/${b.gigId}`} onClick={() => setOpen(false)}>
                      {b.title}
                    </Link>
                    <Typography.Text type="secondary"> · {t(`deleteAccount.blocker_${b.code}`)}</Typography.Text>
                  </li>
                ),
              )}
            </ul>
          </Flex>
        ) : (
          <Flex vertical gap={12}>
            <div>
              <Typography.Text strong>{t('deleteAccount.goesTitle')}</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
                {t('deleteAccount.goes')}
              </Typography.Paragraph>
            </div>
            <div>
              <Typography.Text strong>{t('deleteAccount.staysTitle')}</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
                {t('deleteAccount.stays')}
              </Typography.Paragraph>
            </div>
            <Alert type="warning" showIcon message={t('deleteAccount.exportFirst')} />
            <Input.Password
              placeholder={t('deleteAccount.password')}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              {t('deleteAccount.googleHint')}
            </Typography.Text>
            <Checkbox checked={understood} onChange={(e) => setUnderstood(e.target.checked)}>
              {t('deleteAccount.understand')}
            </Checkbox>
          </Flex>
        )}
      </Modal>
    </Flex>
  );
};

export default DeleteAccount;
