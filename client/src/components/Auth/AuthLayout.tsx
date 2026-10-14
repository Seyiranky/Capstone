import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Grid, Typography, theme } from 'antd';
import LanguageToggle from '../common/LanguageToggle';
import authHeroPhoto from '../../assets/auth-hero.jpg';
import logo from '../../assets/logo.png';
import { useThemeMode } from '../../theme/ThemeProvider';

const { useToken } = theme;


const AuthLayout = ({ children }: { children: ReactNode }) => {
  const { token } = useToken();
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
  const showBrand = screens.md;
  const { isDark } = useThemeMode();

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
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 440 }}>
            <Typography.Title level={1} style={{ color: '#fff', margin: 0, fontSize: 40, lineHeight: 1.15, textWrap: 'balance' }}>
              {t('authPanel.title')}
            </Typography.Title>
            <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.88)', fontSize: 16.5, lineHeight: 1.6, margin: 0, textWrap: 'pretty' }}>
              {t('authPanel.body')}
            </Typography.Paragraph>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            {/* The mark is navy; on the dark theme it sits on a white tile so it stays legible. */}
            <span
              style={{
                display: 'inline-flex',
                padding: isDark ? 8 : 0,
                background: isDark ? '#ffffff' : 'transparent',
                borderRadius: 10,
              }}
            >
              <img src={logo} alt="Isoko Talents" style={{ height: 72, display: 'block' }} />
            </span>
            <LanguageToggle />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
