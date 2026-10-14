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
            // The words sit at the foot of the photo, clear of the worker's face.
            justifyContent: 'flex-end',
            gap: 20,
            padding: '56px 56px 64px',
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
                'linear-gradient(180deg, rgba(9,9,11,0.05) 0%, rgba(9,9,11,0.15) 40%, rgba(9,9,11,0.7) 72%, rgba(9,9,11,0.88) 100%)',
            }}
          />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480 }}>
            <span style={{ width: 48, height: 4, borderRadius: 2, background: '#ffffff' }} />
            <Typography.Title level={1} style={{ color: '#fff', margin: 0, fontSize: 38, lineHeight: 1.15, letterSpacing: '-0.01em', textWrap: 'balance' }}>
              {t('authPanel.title')}
            </Typography.Title>
            <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16, lineHeight: 1.6, margin: 0, maxWidth: 420, textWrap: 'pretty' }}>
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
          position: 'relative',
          padding: showBrand ? '64px 40px 40px' : '64px 24px 24px',
          background: token.colorBgContainer,
        }}
      >
        <div style={{ position: 'absolute', top: 20, right: 24 }}>
          <LanguageToggle />
        </div>
        <div style={{ width: '100%', maxWidth: 352 }}>
          {/* The mark, large enough to read. On the dark theme it sits on a white
              tile so the navy stays legible. */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <span
              style={{
                display: 'inline-flex',
                padding: isDark ? 10 : 0,
                background: isDark ? '#ffffff' : 'transparent',
                borderRadius: 14,
                flexShrink: 0,
              }}
            >
              <img src={logo} alt="Isoko Talents" style={{ height: showBrand ? 92 : 80, display: 'block' }} />
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
