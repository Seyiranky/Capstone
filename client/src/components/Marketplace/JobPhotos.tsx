import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Flex, Image, Typography } from 'antd';
import { CameraOutlined } from '@ant-design/icons';
import { matchApi } from '../../api/matchApi';
import { resolveAssetUrl } from '../../utils/assetUrl';
import type { Match } from '../../types';

const MAX = 3;

/**
 * Photos of the finished work on a job. The worker adds them; everyone on the
 * job sees them, and once it is paid they become its work-history entry.
 */
const JobPhotos = ({ match, canAdd, onChanged }: { match: Match; canAdd: boolean; onChanged: () => void }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const photos = match.photos ?? [];
  const room = MAX - photos.length;

  if (photos.length === 0 && !canAdd) return null;

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      await matchApi.addPhotos(match.id, [...files].slice(0, room));
      onChanged();
    } catch {
      message.error(t('jobPhotos.failed'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
        {t('jobPhotos.title')}
      </Typography.Text>
      <Flex gap={6} wrap="wrap" align="center">
        <Image.PreviewGroup>
          {photos.map((p) => (
            <Image
              key={p.url}
              src={resolveAssetUrl(p.url)}
              width={56}
              height={56}
              style={{ objectFit: 'cover', borderRadius: 4 }}
            />
          ))}
        </Image.PreviewGroup>
        {canAdd && room > 0 && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => upload(e.target.files)}
            />
            <Button
              icon={<CameraOutlined />}
              loading={uploading}
              onClick={() => inputRef.current?.click()}
              style={{ height: 56 }}
            >
              {photos.length === 0 ? t('jobPhotos.add') : `+${room}`}
            </Button>
          </>
        )}
      </Flex>
      {canAdd && photos.length === 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
          {t('jobPhotos.hint')}
        </Typography.Text>
      )}
    </div>
  );
};

export default JobPhotos;
