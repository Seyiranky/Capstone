import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Flex, Input, InputNumber, Modal, Tag, Typography } from 'antd';
import { TeamOutlined, UserAddOutlined } from '@ant-design/icons';
import { isAxiosError } from 'axios';
import { matchApi } from '../../api/matchApi';
import { teamApi } from '../../api/teamApi';
import { useAppSelector } from '../../store/hooks';
import IdentityLink from '../common/IdentityLink';
import WorkerPicker from './WorkerPicker';
import type { Match } from '../../types';

const errorText = (error: unknown) =>
  isAxiosError(error) ? (error.response?.data?.message ?? 'Something went wrong') : 'Something went wrong';

/**
 * Who is on a job besides its lead, from the viewer's seat.
 *
 * An invited member joins or declines here. The lead adds an apprentice while
 * the job is in progress and, once it is paid, endorses them or not.
 */
const TeamSection = ({ match, onChanged }: { match: Match; onChanged: () => void }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const me = useAppSelector((s) => s.auth.profile);
  const [adding, setAdding] = useState(false);
  const [apprenticeId, setApprenticeId] = useState<string | undefined>();
  const [share, setShare] = useState<number>(10);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const members = (match.members ?? []).filter((m) => m.status !== 'declined');
  const isLead = match.workerId === me?.id;
  const mine = (match.members ?? []).find((m) => m.userId === me?.id);
  const hasApprentice = members.some((m) => m.role === 'apprentice');
  const toEndorse = members.find(
    (m) => m.role === 'apprentice' && m.status === 'joined' && !m.endorsement,
  );
  const canAddApprentice = isLead && match.status === 'accepted' && !hasApprentice;

  if (!members.length && !canAddApprentice) return null;

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      onChanged();
      return true;
    } catch (error) {
      message.error(errorText(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: 10 }}>
      {members.length > 0 && (
        <>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            <TeamOutlined /> {t('team.title')}
          </Typography.Text>
          <Flex vertical gap={4}>
            {members.map((m) => (
              <Flex key={m.id} justify="space-between" align="center" gap={8} wrap="wrap">
                <Flex align="center" gap={6} style={{ minWidth: 0 }}>
                  {m.user ? <IdentityLink id={m.user.id} name={m.user.name} size={20} /> : null}
                  <Tag style={{ margin: 0 }}>{t(`team.roleLabel_${m.role}`)}</Tag>
                </Flex>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {m.sharePercent}% · {t(`team.${m.endorsement ?? m.status}`)}
                </Typography.Text>
              </Flex>
            ))}
          </Flex>
        </>
      )}

      {mine?.status === 'invited' && match.status === 'accepted' && (
        <div style={{ marginTop: 8 }}>
          <Typography.Text style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
            {t('team.youWereInvited', { role: t(`team.roleLabel_${mine.role}`).toLowerCase() })}{' '}
            {t('team.share', { percent: mine.sharePercent })}
          </Typography.Text>
          <Flex gap={8}>
            <Button type="primary" size="small" loading={busy} onClick={() => act(() => teamApi.respond(mine.id, true))}>
              {t('team.join')}
            </Button>
            <Button size="small" loading={busy} onClick={() => act(() => teamApi.respond(mine.id, false))}>
              {t('team.decline')}
            </Button>
          </Flex>
        </div>
      )}

      {canAddApprentice && (
        <Button
          type="link"
          size="small"
          icon={<UserAddOutlined />}
          style={{ paddingInline: 0, marginTop: 4 }}
          onClick={() => setAdding(true)}
        >
          {t('team.addApprentice')}
        </Button>
      )}

      {isLead && match.status === 'completed' && toEndorse && (
        <div style={{ marginTop: 10 }}>
          <Typography.Text strong style={{ fontSize: 13, display: 'block' }}>
            {t('team.endorseTitle')}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', margin: '2px 0 6px' }}>
            {t('team.endorseHelp')}
          </Typography.Text>
          <Input.TextArea
            rows={2}
            maxLength={280}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('team.notePlaceholder')}
            style={{ marginBottom: 6 }}
          />
          <Flex gap={8}>
            <Button type="primary" size="small" loading={busy} onClick={() => act(() => teamApi.endorse(toEndorse.id, true, note))}>
              {t('team.endorse')}
            </Button>
            <Button size="small" loading={busy} onClick={() => act(() => teamApi.endorse(toEndorse.id, false, note))}>
              {t('team.notThisTime')}
            </Button>
          </Flex>
        </div>
      )}

      <Modal
        open={adding}
        title={t('team.apprenticeTitle')}
        okText={t('team.invite')}
        okButtonProps={{ disabled: !apprenticeId }}
        confirmLoading={busy}
        onCancel={() => setAdding(false)}
        onOk={async () => {
          if (apprenticeId && (await act(() => matchApi.inviteApprentice(match.id, apprenticeId, share)))) {
            setAdding(false);
            setApprenticeId(undefined);
          }
        }}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          {t('team.apprenticeHelp')}
        </Typography.Paragraph>
        <WorkerPicker value={apprenticeId} onChange={(id) => setApprenticeId(id)} exclude={[me?.id ?? '']} />
        <Typography.Text strong style={{ display: 'block', margin: '14px 0 6px' }}>
          {t('team.apprenticeShare')}
        </Typography.Text>
        <InputNumber min={0} max={30} value={share} onChange={(v) => setShare(v ?? 0)} addonAfter="%" />
      </Modal>
    </div>
  );
};

export default TeamSection;
