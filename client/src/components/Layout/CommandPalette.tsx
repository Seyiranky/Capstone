import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Empty, Input, Modal, Tag, Typography } from 'antd';
import type { InputRef } from 'antd';
import {
  AppstoreOutlined,
  ArrowRightOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchGigs } from '../../store/slices/gigSlice';
import { visibleNavEntries } from './navConfig';

interface Item {
  key: string;
  label: string;
  sub?: string;
  to: string;
  kind: 'page' | 'gig';
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const CommandPalette = ({ open, onClose }: CommandPaletteProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { role } = useAppSelector((s) => s.auth);
  const gigs = useAppSelector((s) => s.gigs.items);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      if (gigs.length === 0) dispatch(fetchGigs());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, dispatch, gigs.length]);

  const items = useMemo<Item[]>(() => {
    const pages: Item[] = visibleNavEntries(role).map((e) => ({
      key: `p:${e.key}`,
      label: t(e.labelKey),
      to: e.key,
      kind: 'page',
    }));
    const gigItems: Item[] = gigs
      .filter((g) => g.status === 'open')
      .slice(0, 40)
      .map((g) => ({
        key: `g:${g.id}`,
        label: g.title,
        sub: `${g.skill?.name ?? ''} · ${Number(g.budget).toLocaleString()} RWF`,
        to: `/gigs/${g.id}`,
        kind: 'gig',
      }));
    return [...pages, ...gigItems];
  }, [role, gigs, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.sub?.toLowerCase().includes(q),
    );
  }, [items, query]);

  const go = (item?: Item) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={560}
      styles={{ body: { padding: 0 } }}
      style={{ top: 96 }}
    >
      <Input
        ref={inputRef}
        size="large"
        variant="borderless"
        placeholder="Search gigs and pages…"
        value={query}
        prefix={<span style={{ color: '#a1a1aa' }}>⌘K</span>}
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === 'Enter') {
            go(filtered[cursor]);
          }
        }}
        style={{ padding: '14px 16px', borderBottom: '1px solid var(--ant-color-border-secondary,#e4e4e7)' }}
      />
      <div style={{ maxHeight: 380, overflowY: 'auto', padding: 6 }}>
        {filtered.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No matches" style={{ padding: 24 }} />
        ) : (
          filtered.map((item, i) => (
            <div
              key={item.key}
              onMouseEnter={() => setCursor(i)}
              onClick={() => go(item)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 4,
                cursor: 'pointer',
                background: i === cursor ? 'rgba(24,24,27,0.06)' : undefined,
              }}
            >
              {item.kind === 'gig' ? (
                <FileTextOutlined style={{ color: '#71717a' }} />
              ) : (
                <AppstoreOutlined style={{ color: '#71717a' }} />
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <Typography.Text ellipsis style={{ display: 'block' }}>
                  {item.label}
                </Typography.Text>
                {item.sub && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                    {item.sub}
                  </Typography.Text>
                )}
              </div>
              {item.kind === 'page' && <Tag style={{ margin: 0 }}>Page</Tag>}
              {i === cursor && <ArrowRightOutlined style={{ color: '#a1a1aa' }} />}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
};

export default CommandPalette;
