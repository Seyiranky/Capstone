import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Flex, Popconfirm, Typography } from 'antd';
import { CameraOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { profileUpdated } from '../../store/slices/authSlice';
import { userApi } from '../../api/userApi';
import Avatar from '../common/Avatar';
import AvatarCropModal from './AvatarCropModal';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
/** Before cropping. The saved picture is a small JPEG whatever the original was. */
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/**
 * The profile picture in Settings: choose a photo, crop it in the round frame,
 * press Done. The picture then replaces the initials everywhere the person
 * appears. It can be changed or removed at any time.
 */
const ProfilePictureField = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => s.auth.profile);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (!profile) return null;
  const hasPicture = Boolean(profile.avatarUrl);

  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    // Cleared so choosing the same file again still opens the cropper.
    e.target.value = '';
    if (!picked) return;
    if (!ACCEPT.includes(picked.type)) {
      message.error(t('avatar.wrongType'));
      return;
    }
    if (picked.size > MAX_SOURCE_BYTES) {
      message.error(t('avatar.tooLarge'));
      return;
    }
    setFile(picked);
  };

  const save = async (image: Blob) => {
    setSaving(true);
    try {
      dispatch(profileUpdated(await userApi.uploadAvatar(image)));
      setFile(null);
      message.success(t('avatar.saved'));
    } catch {
      message.error(t('avatar.failed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      dispatch(profileUpdated(await userApi.removeAvatar()));
      message.success(t('avatar.removed'));
    } catch {
      message.error(t('avatar.failed'));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="isoko-avatar-field">
      <button
        type="button"
        className="isoko-avatar-field__photo"
        onClick={() => input.current?.click()}
        aria-label={hasPicture ? t('avatar.change') : t('avatar.upload')}
      >
        <Avatar name={profile.name} src={profile.avatarUrl} size={80} />
        <span className="isoko-avatar-field__badge">
          <CameraOutlined />
        </span>
      </button>
      <div style={{ minWidth: 0 }}>
        <Typography.Text strong style={{ display: 'block' }}>
          {t('avatar.title')}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 2 }}>
          {t('avatar.hint')}
        </Typography.Text>
        <Flex gap={8} wrap="wrap" style={{ marginTop: 10 }}>
          <Button size="small" icon={<UploadOutlined />} onClick={() => input.current?.click()}>
            {hasPicture ? t('avatar.change') : t('avatar.upload')}
          </Button>
          {hasPicture && (
            <Popconfirm
              title={t('avatar.removeConfirm')}
              okText={t('avatar.remove')}
              cancelText={t('common.cancel')}
              okButtonProps={{ danger: true }}
              onConfirm={remove}
            >
              <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={removing}>
                {t('avatar.remove')}
              </Button>
            </Popconfirm>
          )}
        </Flex>
      </div>
      <input ref={input} type="file" accept={ACCEPT.join(',')} hidden onChange={choose} />
      <AvatarCropModal file={file} saving={saving} onCancel={() => !saving && setFile(null)} onDone={save} />
    </div>
  );
};

export default ProfilePictureField;
