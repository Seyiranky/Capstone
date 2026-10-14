import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Divider, Form, Input, InputNumber, Radio, Select, Typography } from 'antd';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchCurrentUser } from '../../store/slices/authSlice';
import { userApi } from '../../api/userApi';
import { KIGALI_LOCATIONS } from '../../constants/locations';
import { locationName as lookupLocationName } from '../../utils/locationName';

const findLocationName = (lat?: number | null, lng?: number | null) =>
  lookupLocationName(lat, lng) ?? KIGALI_LOCATIONS[0].name;

interface ProfileValues {
  bio?: string;
  locationName: string;
  yearsExperience?: number | null;
  experienceSummary?: string;
  availability?: 'available' | 'busy' | 'away';
  availableFrom?: string;
}

const ProfileEditor = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const dispatch = useAppDispatch();
  const { profile, role } = useAppSelector((state) => state.auth);
  const [saving, setSaving] = useState(false);

  const onFinish = async (values: ProfileValues) => {
    setSaving(true);
    try {
      const location =
        KIGALI_LOCATIONS.find((l) => l.name === values.locationName) ?? KIGALI_LOCATIONS[0];
      await userApi.updateProfile({
        bio: values.bio || undefined,
        locationLat: location.lat,
        locationLng: location.lng,
        ...(role === 'worker'
          ? {
              // Sent as null rather than omitted so a worker can clear a value
              // they previously set, not merely change it.
              yearsExperience: values.yearsExperience ?? null,
              experienceSummary: values.experienceSummary || null,
              // Clients filter the directory by this; away hides a worker from shortlists until the date.
              availability: values.availability,
              availableFrom: values.availability === 'away' && values.availableFrom ? values.availableFrom : null,
            }
          : {}),
      });
      await dispatch(fetchCurrentUser());
      message.success(t('settings.saved'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form
      layout="vertical"
      requiredMark={false}
      onFinish={onFinish}
      initialValues={{
        bio: profile?.bio ?? '',
        locationName: findLocationName(profile?.locationLat, profile?.locationLng),
        yearsExperience: profile?.yearsExperience ?? undefined,
        experienceSummary: profile?.experienceSummary ?? '',
        availability: profile?.availability ?? 'available',
        availableFrom: profile?.availableFrom ? profile.availableFrom.slice(0, 10) : undefined,
      }}
    >
      <Form.Item name="bio" label={t('settings.bioLabel')}>
        <Input.TextArea rows={3} />
      </Form.Item>
      {role === 'worker' && (
        <>
          <Form.Item name="availability" label={t('growth.availability')} extra={t('growth.availabilityHelp')}>
            <Radio.Group optionType="button" buttonStyle="solid">
              {(['available', 'busy', 'away'] as const).map((a) => (
                <Radio.Button key={a} value={a}>
                  {t(`growth.av_${a}`)}
                </Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.availability !== b.availability}>
            {({ getFieldValue }) =>
              getFieldValue('availability') === 'away' && (
                <Form.Item name="availableFrom" label={t('growth.awayUntil')} rules={[{ required: true }]}>
                  <Input type="date" min={new Date().toISOString().slice(0, 10)} style={{ maxWidth: 220 }} />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item name="locationName" label={t('settings.locationLabel')}>
            <Select options={KIGALI_LOCATIONS.map((l) => ({ value: l.name, label: l.name }))} />
          </Form.Item>

          <Divider plain style={{ marginTop: 8 }}>
            {t('experience.title')}
          </Divider>
          <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: -4 }}>
            {t('experience.hint')}
          </Typography.Paragraph>

          <Form.Item name="yearsExperience" label={t('experience.yearsLabel')}>
            <InputNumber min={0} max={60} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="experienceSummary" label={t('experience.summaryLabel')}>
            <Input.TextArea rows={3} placeholder={t('experience.summaryPlaceholder')} />
          </Form.Item>
        </>
      )}
      <Button type="primary" htmlType="submit" loading={saving}>
        {t('settings.saveProfile')}
      </Button>
    </Form>
  );
};

export default ProfileEditor;
