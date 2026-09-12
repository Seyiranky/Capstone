import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, App, Button, Form, Input, InputNumber, Select, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { skillApi } from '../../api/skillApi';
import { gigApi } from '../../api/gigApi';
import { useAppDispatch } from '../../store/hooks';
import { fetchGigs } from '../../store/slices/gigSlice';
import { KIGALI_LOCATIONS } from '../../constants/locations';
import { locationName as lookupLocationName } from '../../utils/locationName';
import type { Gig, Skill } from '../../types';

interface GigFormProps {
  gig?: Gig;
  onPosted?: () => void;
}

interface GigFormValues {
  title: string;
  description: string;
  budget: number;
  skillId: string;
  locationName: string;
}

const GigForm = ({ gig, onPosted }: GigFormProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const dispatch = useAppDispatch();
  const isEdit = !!gig;
  const [skills, setSkills] = useState<Skill[]>([]);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    skillApi.listSkills().then(setSkills);
  }, []);

  const initialValues = useMemo(
    () =>
      gig
        ? {
            title: gig.title,
            description: gig.description,
            budget: Number(gig.budget),
            skillId: gig.skillId,
            locationName:
              lookupLocationName(gig.locationLat, gig.locationLng) ?? KIGALI_LOCATIONS[0].name,
          }
        : { locationName: KIGALI_LOCATIONS[0].name },
    [gig],
  );

  const onFinish = async (values: GigFormValues) => {
    setError(null);
    setSubmitting(true);
    try {
      const location =
        KIGALI_LOCATIONS.find((l) => l.name === values.locationName) ?? KIGALI_LOCATIONS[0];
      if (isEdit && gig) {
        await gigApi.updateGig(gig.id, {
          title: values.title,
          description: values.description,
          budget: Number(values.budget),
          locationLat: location.lat,
          locationLng: location.lng,
        });
        dispatch(fetchGigs());
        message.success('Gig updated.');
      } else {
        const imageFile = fileList[0]?.originFileObj as File | undefined;
        await gigApi.createGig(
          {
            title: values.title,
            description: values.description,
            budget: Number(values.budget),
            skillId: values.skillId,
            locationLat: location.lat,
            locationLng: location.lng,
          },
          imageFile,
        );
        setFileList([]);
        dispatch(fetchGigs());
        message.success('Gig posted — an admin will review it shortly.');
      }
      onPosted?.();
    } catch {
      setError(t('marketplace.gigForm.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form layout="vertical" requiredMark={false} onFinish={onFinish} initialValues={initialValues}>
      <Form.Item name="title" label={t('marketplace.gigForm.titleLabel')} rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item
        name="description"
        label={t('marketplace.gigForm.descriptionLabel')}
        rules={[{ required: true }]}
      >
        <Input.TextArea rows={3} />
      </Form.Item>
      <Form.Item
        name="budget"
        label={t('marketplace.gigForm.budgetLabel')}
        rules={[{ required: true }]}
      >
        <InputNumber<number>
          min={0}
          style={{ width: '100%' }}
          addonAfter="RWF"
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={(v) => Number((v ?? '').replace(/,/g, ''))}
        />
      </Form.Item>
      {!isEdit && (
        <Form.Item
          name="skillId"
          label={t('marketplace.gigForm.skillCategoryLabel')}
          rules={[{ required: true }]}
        >
          <Select options={skills.map((s) => ({ value: s.id, label: s.name }))} />
        </Form.Item>
      )}
      <Form.Item name="locationName" label={t('marketplace.gigForm.locationLabel')}>
        <Select options={KIGALI_LOCATIONS.map((l) => ({ value: l.name, label: l.name }))} />
      </Form.Item>
      {!isEdit && (
        <Form.Item label={t('marketplace.gigForm.photoLabel')}>
          <Upload
            listType="picture"
            maxCount={1}
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList: fl }) => setFileList(fl.slice(-1))}
            accept="image/*"
          >
            <Button icon={<UploadOutlined />}>{t('marketplace.gigForm.photoLabel')}</Button>
          </Upload>
        </Form.Item>
      )}
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Button type="primary" htmlType="submit" block loading={submitting}>
        {isEdit ? 'Save changes' : t('marketplace.gigForm.submit')}
      </Button>
    </Form>
  );
};

export default GigForm;
