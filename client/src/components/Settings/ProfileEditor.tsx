import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Form, Input, Select } from 'antd';
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
      }}
    >
      <Form.Item name="bio" label={t('settings.bioLabel')}>
        <Input.TextArea rows={3} />
      </Form.Item>
      {role === 'worker' && (
        <Form.Item name="locationName" label={t('settings.locationLabel')}>
          <Select options={KIGALI_LOCATIONS.map((l) => ({ value: l.name, label: l.name }))} />
        </Form.Item>
      )}
      <Button type="primary" htmlType="submit" loading={saving}>
        {t('settings.saveProfile')}
      </Button>
    </Form>
  );
};

export default ProfileEditor;
