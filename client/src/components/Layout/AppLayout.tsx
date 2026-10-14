import { useEffect, useState } from 'react';
import OfflineBanner from '../common/OfflineBanner';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Drawer, Grid, Layout } from 'antd';
import SideNav from './SideNav';
import SideFooter from './SideFooter';
import AppHeader from './AppHeader';
import CommandPalette from './CommandPalette';
import ShortcutsModal from './ShortcutsModal';
import { useThemeMode } from '../../theme/ThemeProvider';
import logo from '../../assets/logo.png';

const { Sider, Header, Content } = Layout;

const AppLayout = () => {
  const screens = Grid.useBreakpoint();
  const { isDark } = useThemeMode();
  const isMobile = !screens.lg;
  // On laptop widths the full sider costs the content ~160px it needs, so it
  // starts collapsed to icons below xl; the toggle still expands it.
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1200);
  useEffect(() => {
    if (screens.xl !== undefined) setCollapsed(!screens.xl);
  }, [screens.xl]);
  // Phones get the nav as an overlay drawer; the inline sider would eat the screen.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { pathname } = useLocation();

  // Any navigation (nav item, footer menu, in-page link) should dismiss the drawer.
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (e.key === '?' && !typing) {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(30,58,95,0.10)';

  const renderNav = (narrow: boolean) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Link
        to="/dashboard"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: narrow ? 'center' : 'flex-start',
          height: 60,
          flexShrink: 0,
          padding: narrow ? 0 : '0 18px',
          borderBottom: `1px solid ${hairline}`,
        }}
      >
        {/* The mark is navy; on the dark sider it sits on a white tile so it stays legible. */}
        <span
          style={{
            display: 'inline-flex',
            padding: isDark ? 3 : 0,
            background: isDark ? '#ffffff' : 'transparent',
            borderRadius: 6,
            flexShrink: 0,
          }}
        >
          <img src={logo} alt="Isoko" style={{ height: 38, display: 'block' }} />
        </span>
        {!narrow && (
          <span
            style={{
              marginInlineStart: 10,
              fontWeight: 800,
              fontSize: 19,
              letterSpacing: '0.02em',
              color: isDark ? '#f4f4f5' : '#252b67',
              whiteSpace: 'nowrap',
            }}
          >
            Isoko
          </span>
        )}
      </Link>
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
        <SideNav dark={isDark} />
      </div>
      <SideFooter collapsed={narrow} dark={isDark} />
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isMobile ? (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          closable={false}
          size={260}
          styles={{ body: { padding: 0 } }}
        >
          {renderNav(false)}
        </Drawer>
      ) : (
        <Sider
          theme={isDark ? 'dark' : 'light'}
          width={236}
          collapsible
          collapsed={collapsed}
          collapsedWidth={76}
          trigger={null}
          style={{
            position: 'sticky',
            top: 0,
            height: '100vh',
            zIndex: 20,
            borderInlineEnd: `1px solid ${hairline}`,
          }}
        >
          {renderNav(collapsed)}
        </Sider>
      )}

      <Layout>
        <Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            borderBottom: `1px solid ${hairline}`,
            paddingInline: isMobile ? 12 : undefined,
          }}
        >
          <AppHeader
            collapsed={isMobile ? !drawerOpen : collapsed}
            onToggle={() => (isMobile ? setDrawerOpen(true) : setCollapsed((c) => !c))}
            onSearch={() => setSearchOpen(true)}
          />
        </Header>
        {/* Above the content, not inside it: connectivity applies to the whole
            session, not to whichever screen happens to be open. */}
        <OfflineBanner />
        <Content style={{ padding: screens.md ? 28 : 16 }}>
          <div style={{ maxWidth: 1180, margin: '0 auto' }}>
            <Outlet />
          </div>
        </Content>
      </Layout>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutsModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </Layout>
  );
};

export default AppLayout;
