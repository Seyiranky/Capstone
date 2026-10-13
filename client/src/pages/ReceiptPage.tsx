import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Divider, Flex, Result, Skeleton, Typography } from 'antd';
import { CheckCircleTwoTone, PrinterOutlined } from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { receiptApi } from '../api/receiptApi';
import LanguageToggle from '../components/common/LanguageToggle';
import logo from '../assets/logo.png';
import type { Receipt } from '../types';

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Flex justify="space-between" align="baseline" gap={16} style={{ padding: '7px 0' }} wrap="wrap">
    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
      {label}
    </Typography.Text>
    <Typography.Text style={{ textAlign: 'right', fontWeight: 500 }}>{children}</Typography.Text>
  </Flex>
);

/**
 * A payout receipt anyone can open from its number or QR code.
 *
 * Built for a lender holding a printout or an income statement line: the page
 * is served by Isoko from Isoko's own record, so what it shows is the check.
 * Printable as-is; the browser chrome and the print button drop out on paper.
 */
const ReceiptPage = () => {
  const { t, i18n } = useTranslation();
  const { number } = useParams<{ number: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!number) return;
    receiptApi
      .get(number)
      .then(setReceipt)
      .catch(() => setMissing(true));
  }, [number]);

  if (missing) {
    return <Result status="warning" title={t('receipt.notFound')} subTitle={t('receipt.notFoundHelp')} />;
  }
  if (!receipt) return <Skeleton active paragraph={{ rows: 8 }} style={{ padding: 24 }} />;

  const url = window.location.href;
  const date = new Date(receipt.releasedAt).toLocaleString(i18n.resolvedLanguage, {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px' }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
      <Flex justify="space-between" align="center" className="no-print" style={{ marginBottom: 16 }}>
        <LanguageToggle />
        <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
          {t('receipt.print')}
        </Button>
      </Flex>

      <Card>
        <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap">
          <div>
            <img src={logo} alt="Isoko Talents" style={{ height: 30, display: 'block', marginBottom: 12 }} />
            <Typography.Title level={4} style={{ margin: 0 }}>
              {t('receipt.title')}
            </Typography.Title>
            <Flex align="center" gap={6} style={{ marginTop: 6 }}>
              <CheckCircleTwoTone twoToneColor="#16a34a" />
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {t('receipt.verified')}
              </Typography.Text>
            </Flex>
          </div>
          <QRCodeSVG value={url} size={88} aria-label={t('receipt.scanHint')} />
        </Flex>

        <Divider style={{ margin: '18px 0 10px' }} />

        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {t('receipt.amount')}
        </Typography.Text>
        <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.2, marginBottom: 8 }}>
          {receipt.amount.toLocaleString()}{' '}
          <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--isoko-muted)' }}>{receipt.currency}</span>
        </div>

        <Row label={t('receipt.number')}>
          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{receipt.number}</span>
        </Row>
        <Row label={t('receipt.releasedOn')}>{date}</Row>
        <Row label={t('receipt.job')}>{receipt.gig ?? '—'}</Row>
        {receipt.skill && <Row label={t('receipt.skill')}>{receipt.skill}</Row>}
        <Row label={t('receipt.worker')}>
          {receipt.worker ?? '—'}
          {receipt.role && receipt.role !== 'lead' ? ` (${t(`team.roleLabel_${receipt.role}`)})` : ''}
        </Row>
        <Row label={t('receipt.client')}>{receipt.client ?? '—'}</Row>
        {receipt.completedVia && (
          <Row label={t('receipt.method')}>{t(`escrow.completedVia_${receipt.completedVia}`)}</Row>
        )}
        {/* Long provider references read better on their own line than squeezed right. */}
        <div style={{ padding: '7px 0' }}>
          <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
            {t('receipt.reference')}
          </Typography.Text>
          <Typography.Text
            style={{ fontSize: 12, wordBreak: 'break-all', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
          >
            {receipt.paymentReference}
          </Typography.Text>
        </div>

        <Divider style={{ margin: '10px 0 12px' }} />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('receipt.scanHint')}
        </Typography.Text>
      </Card>
    </div>
  );
};

export default ReceiptPage;
