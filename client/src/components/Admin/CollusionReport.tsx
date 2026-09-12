import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Progress,
  Row,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { adminApi } from '../../api/adminApi';
import type { CollusionFlag, CollusionReport as Report } from '../../types';

const SEVERITY_COLOUR: Record<string, string> = {
  high: 'red',
  medium: 'orange',
  low: 'default',
};

const FLAG_LABEL: Record<string, string> = {
  rubberStamped: 'Decided too fast to have read the evidence',
  priorGigRelationship: 'Reviewer previously worked with this worker',
  repeatedPairing: 'Pair recurs more often than chance',
  approvesEverything: 'Approval rate far above peers',
  rejectsEverything: 'Approval rate far below peers',
};

const describeEvidence = (flag: CollusionFlag) =>
  Object.entries(flag.evidence)
    .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${value}`)
    .join(' · ');

const toCsv = (report: Report) => {
  const header = [
    'type',
    'severity',
    'workerId',
    'workerName',
    'reviewerId',
    'reviewerName',
    'taskId',
    'evidence',
  ];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = report.flags.map((f) =>
    [
      f.type,
      f.severity,
      f.workerId,
      f.workerName,
      f.reviewerId,
      f.reviewerName,
      f.taskId,
      describeEvidence(f),
    ]
      .map(escape)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
};

/**
 * Audit of reviewer assignment for signs of worker-reviewer collusion (RQ1).
 *
 * Every row carries the numbers behind it, because a flag is a prompt to look
 * rather than a finding of misconduct.
 */
const CollusionReport = () => {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    adminApi
      .collusionReport()
      .then(setReport)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const download = () => {
    if (!report) return;
    const blob = new Blob([toCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `isoko-collusion-audit-${report.generatedAt.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (!report) return <Alert type="error" message="Could not load the audit." />;

  const flagColumns: ColumnsType<CollusionFlag> = [
    {
      title: 'Signal',
      key: 'type',
      render: (_, f) => (
        <Space direction="vertical" size={2}>
          <Flex align="center" gap={8}>
            <Tag color={SEVERITY_COLOUR[f.severity]} style={{ margin: 0 }}>
              {f.severity}
            </Tag>
            <Typography.Text strong style={{ fontSize: 13 }}>
              {FLAG_LABEL[f.type] ?? f.type}
            </Typography.Text>
          </Flex>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {describeEvidence(f)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Worker',
      key: 'worker',
      width: 160,
      render: (_, f) => f.workerName ?? f.workerId?.slice(0, 8) ?? '—',
    },
    {
      title: 'Reviewer',
      key: 'reviewer',
      width: 160,
      render: (_, f) => f.reviewerName ?? f.reviewerId?.slice(0, 8) ?? '—',
    },
  ];

  const maxShare = Math.max(...report.reviewerLoad.map((r) => r.share), 0.0001);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Assignments
            </Typography.Text>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{report.summary.assignments}</div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Reviewers used
            </Typography.Text>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {report.summary.distinctReviewers}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Decided
            </Typography.Text>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{report.summary.decided}</div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Flagged
            </Typography.Text>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: report.summary.flagged > 0 ? '#c2410c' : undefined,
              }}
            >
              {report.summary.flagged}
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        title="Reviewer assignment distribution"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load} size="small">
              Refresh
            </Button>
            <Button icon={<DownloadOutlined />} onClick={download} size="small">
              Export CSV
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          An even spread is what rotation is meant to produce. A reviewer taking a
          disproportionate share is worth a look even without a specific flag.
        </Typography.Paragraph>
        {report.reviewerLoad.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No assignments yet." />
        ) : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {report.reviewerLoad.map((row) => (
              <div key={row.reviewerId}>
                <Flex justify="space-between">
                  <Typography.Text style={{ fontSize: 13 }}>
                    {row.reviewerName ?? row.reviewerId.slice(0, 8)}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {row.assignments} ({Math.round(row.share * 100)}%)
                  </Typography.Text>
                </Flex>
                <Progress
                  percent={Math.round((row.share / maxShare) * 100)}
                  showInfo={false}
                  size="small"
                  strokeColor="#1f1f1f"
                />
              </div>
            ))}
          </Space>
        )}
      </Card>

      <Card title={`Flagged signals (${report.flags.length})`}>
        {report.flags.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Nothing flagged. Assignment looks consistent with the rotation rules."
          />
        ) : (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message="A flag is a prompt to investigate, not a finding of misconduct. Read the evidence before acting."
            />
            <Table
              rowKey={(f) => `${f.type}-${f.taskId ?? ''}-${f.workerId ?? ''}-${f.reviewerId ?? ''}`}
              size="small"
              pagination={false}
              columns={flagColumns}
              dataSource={report.flags}
            />
          </>
        )}
      </Card>

      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        Generated {new Date(report.generatedAt).toLocaleString()}
      </Typography.Text>
    </Space>
  );
};

export default CollusionReport;
