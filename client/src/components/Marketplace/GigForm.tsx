import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, App, Button, Checkbox, Form, Input, InputNumber, Select, Upload } from 'antd';
import { AudioOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { clipFile, useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import VoiceNoteDraft from '../Voice/VoiceNoteDraft';
import { skillApi } from '../../api/skillApi';
import { gigApi } from '../../api/gigApi';
import { useAppDispatch } from '../../store/hooks';
import { fetchGigs } from '../../store/slices/gigSlice';
import { KIGALI_LOCATIONS } from '../../constants/locations';
import { locationName as lookupLocationName } from '../../utils/locationName';
import type { Gig, Skill } from '../../types';
import RateHint from './RateHint';
import { apiErrorMessage } from '../../utils/apiError';
import { looksSensitive } from '../../lib/sensitiveGig';

interface GigFormProps {
  gig?: Gig;
  onPosted?: () => void;
}

interface GigFormValues {
  title: string;
  description: string;
  budget: number;
  categoryId: string;
  specialisationId?: string;
  requiredLevel?: number | null;
  sensitive?: boolean;
  locationName: string;
}

/** A category with its specialisations, as returned by `?tree=1`. */
type SkillTree = Skill & { children?: Skill[] };

const GigForm = ({ gig, onPosted }: GigFormProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const dispatch = useAppDispatch();
  const isEdit = !!gig;
  const [skills, setSkills] = useState<SkillTree[]>([]);
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const recorder = useVoiceRecorder();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const budget = Form.useWatch('budget', form) as number | undefined;
  const title = Form.useWatch('title', form) as string | undefined;
  const description = Form.useWatch('description', form) as string | undefined;
  // What Isoko will decide from the words: shown as the client types.
  const wordsSensitive = looksSensitive(title ?? '', description ?? '');
  // The words decide it, so the box shows ticked (and cannot be unticked) while they do.
  useEffect(() => {
    if (wordsSensitive) form.setFieldValue('sensitive', true);
  }, [wordsSensitive, form]);

  useEffect(() => {
    skillApi.listSkillTree().then(setSkills);
  }, []);

  // Specialisations are optional. A client who does not know which one they
  // need leaves it blank and is matched at category level.
  const specialisations = skills.find((s) => s.id === categoryId)?.children ?? [];

  const initialValues = useMemo(
    () =>
      gig
        ? {
            title: gig.title,
            description: gig.description,
            budget: Number(gig.budget),
            categoryId: gig.skillId,
            requiredLevel: gig.requiredLevel ?? undefined,
            sensitive: gig.sensitive ?? false,
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
          requiredLevel: values.requiredLevel ?? null,
          sensitive: Boolean(values.sensitive),
          locationLat: location.lat,
          locationLng: location.lng,
        });
        dispatch(fetchGigs());
        message.success(t('marketplace.gigForm.updated'));
      } else {
        const imageFile = fileList[0]?.originFileObj as File | undefined;
        await gigApi.createGig(
          {
            title: values.title,
            description: values.description,
            budget: Number(values.budget),
            // The specialisation is the gig's skill when given; otherwise the
            // category, which still matches but with less resolution.
            skillId: values.specialisationId || values.categoryId,
            requiredLevel: values.requiredLevel ?? null,
            sensitive: Boolean(values.sensitive),
            locationLat: location.lat,
            locationLng: location.lng,
          },
          imageFile,
          recorder.state === 'recorded' && recorder.clip
            ? { file: clipFile(recorder.clip), durationSec: recorder.clip.durationSec }
            : undefined,
        );
        setFileList([]);
        recorder.discard();
        dispatch(fetchGigs());
        message.success(t('marketplace.gigForm.posted'));
      }
      onPosted?.();
    } catch (err) {
      setError(apiErrorMessage(err, t('marketplace.gigForm.submitError')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form form={form} layout="vertical" requiredMark={false} onFinish={onFinish} initialValues={initialValues}>
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
        extra={<RateHint skillId={gig?.skillId ?? categoryId} amount={budget} audience="client" />}
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
        <>
          <Form.Item
            name="categoryId"
            label={t('skills.categoryLabel')}
            rules={[{ required: true }]}
          >
            <Select
              options={skills.map((s) => ({ value: s.id, label: s.name }))}
              onChange={(value) => setCategoryId(value as string)}
            />
          </Form.Item>

          {specialisations.length > 0 && (
            <Form.Item
              name="specialisationId"
              label={t('skills.specialisationLabel')}
              extra={t('skills.specialisationHint')}
            >
              <Select
                allowClear
                placeholder={t('skills.anySpecialisation')}
                options={specialisations.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Form.Item>
          )}
        </>
      )}

      <Form.Item
        name="requiredLevel"
        label={t('skills.requiredLevelLabel')}
        extra={t('skills.requiredLevelHint')}
      >
        <Select
          allowClear
          placeholder={t('skills.anyLevel')}
          options={[1, 2, 3, 4, 5].map((n) => ({
            value: n,
            label: t(`skills.levelName.${n}`),
          }))}
        />
      </Form.Item>
      <Form.Item
        name="sensitive"
        valuePropName="checked"
        extra={wordsSensitive ? t('applyRules.formAuto') : t('applyRules.formHint')}
      >
        <Checkbox disabled={wordsSensitive}>
          {t('applyRules.formLabel')}
        </Checkbox>
      </Form.Item>
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
      {!isEdit && (
        <Form.Item
          label={t('voice.gigLabel')}
          extra={recorder.error ? t(recorder.error === 'denied' ? 'voice.denied' : 'voice.unsupported') : t('voice.gigHint')}
          validateStatus={recorder.error ? 'error' : undefined}
        >
          {recorder.state === 'idle' ? (
            <Button icon={<AudioOutlined />} onClick={recorder.start}>
              {t('voice.record')}
            </Button>
          ) : (
            <VoiceNoteDraft recorder={recorder} />
          )}
        </Form.Item>
      )}
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Button type="primary" htmlType="submit" block loading={submitting} disabled={recorder.state === 'recording'}>
        {isEdit ? t('common.saveChanges') : t('marketplace.gigForm.submit')}
      </Button>
    </Form>
  );
};

export default GigForm;
