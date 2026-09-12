import type { ReactNode } from 'react';
import { Grid, Space, Typography, theme } from 'antd';
import LanguageToggle from '../common/LanguageToggle';
import authHeroPhoto from '../../assets/auth-hero.jpg';
import logo from '../../assets/logo.png';

const { useToken } = theme;

const Proof = ({ value, label }: { value: string; label: string }) => (
  <div>
    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontSize: 13, opacity: 0.8 }}>{label}</div>
  </div>
);

const AuthLayout = ({ children }: { children: ReactNode }) => {
  const { token } = useToken();
  const screens = Grid.useBreakpoint();
  const showBrand = screens.md;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', overflow: 'hidden' }}>
      {showBrand && (
        <div
          style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 20,
            padding: 56,
            color: '#fff',
            background: '#0b0b0d',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${authHeroPhoto})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(9,9,11,0.35) 0%, rgba(9,9,11,0.55) 60%, rgba(9,9,11,0.7) 100%)',
            }}
          />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <img src={logo} alt="Isoko Talents" style={{ height: 44, alignSelf: 'flex-start' }} />
            <Typography.Title level={1} style={{ color: '#fff', margin: 0, maxWidth: 460 }}>
              Turn your skills into income.
            </Typography.Title>
            <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, maxWidth: 440 }}>
              Isoko Talents connects verified workers with clients across Kigali — post a gig, get
              matched, get paid.
            </Typography.Paragraph>
            <Space size={48} style={{ marginTop: 12 }}>
              <Proof value="4 trades" label="Verified skill tracks" />
              <Proof value="Trust-scored" label="Every worker profile" />
              <Proof value="Mobile-money" label="Simulated payments" />
            </Space>
          </div>
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'safe center',
          justifyContent: 'center',
          overflowY: 'auto',
          padding: showBrand ? 40 : 24,
          background: token.colorBgContainer,
        }}
      >
        <div style={{ width: '100%', maxWidth: 384 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <LanguageToggle />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
