import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Grid, Layout } from 'antd';
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
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const sidebarCollapsed = isMobile ? true : collapsed;

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

  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(24,24,27,0.08)';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme={isDark ? 'dark' : 'light'}
        width={236}
        collapsible
        collapsed={sidebarCollapsed}
        collapsedWidth={isMobile ? 0 : 76}
        trigger={null}
        breakpoint="lg"
        style={{
          position: isMobile ? 'fixed' : 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 20,
          borderInlineEnd: `1px solid ${hairline}`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Link
            to="/dashboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              height: 60,
              flexShrink: 0,
              padding: sidebarCollapsed ? 0 : '0 18px',
              borderBottom: `1px solid ${hairline}`,
            }}
          >
            <img
              src={logo}
              alt="Isoko Talents"
              style={{
                height: sidebarCollapsed ? 26 : 32,
                width: 'auto',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </Link>
          <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
            <SideNav dark={isDark} onNavigate={() => isMobile && setCollapsed(true)} />
          </div>
          <SideFooter collapsed={sidebarCollapsed} dark={isDark} />
        </div>
      </Sider>

      <Layout>
        <Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            borderBottom: `1px solid ${hairline}`,
          }}
        >
          <AppHeader
            collapsed={collapsed}
            onToggle={() => setCollapsed((c) => !c)}
            onSearch={() => setSearchOpen(true)}
          />
        </Header>
        <Content style={{ padding: screens.xs ? 16 : 28 }}>
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
