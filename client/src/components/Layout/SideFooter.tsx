import { useNavigate } from 'react-router-dom';
import { Dropdown, Space, Typography } from 'antd';
import { LogoutOutlined, MoreOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import Avatar from '../common/Avatar';

interface SideFooterProps {
  collapsed: boolean;
  dark: boolean;
}

const SideFooter = ({ collapsed, dark }: SideFooterProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { profile, role } = useAppSelector((state) => state.auth);

  const nameColor = dark ? '#fff' : '#18181b';
  const subColor = dark ? 'rgba(255,255,255,0.5)' : '#71717a';
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(24,24,27,0.08)';

  const menu = {
    items: [
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: t('sidebar.profile'),
        onClick: () => profile && navigate(`/profile/${profile.id}`),
      },
      {
        key: 'settings',
        icon: <SettingOutlined />,
        label: t('sidebar.settings'),
        onClick: () => navigate('/settings'),
      },
      { type: 'divider' as const },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: t('sidebar.logout'),
        danger: true,
        onClick: () => {
          dispatch(logout());
          navigate('/login');
        },
      },
    ],
  };

  return (
    <div
      style={{
        marginTop: 'auto',
        padding: collapsed ? '10px 0' : 10,
        borderTop: `1px solid ${border}`,
      }}
    >
      <Dropdown menu={menu} placement="topLeft" trigger={['click']}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '6px 8px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          <Avatar name={profile?.name ?? '?'} size={32} />
          {!collapsed && (
            <>
              <Space direction="vertical" size={0} style={{ lineHeight: 1.2, minWidth: 0, flex: 1 }}>
                <Typography.Text style={{ color: nameColor, fontSize: 13 }} ellipsis>
                  {profile?.name ?? '…'}
                </Typography.Text>
                <Typography.Text style={{ color: subColor, fontSize: 11, textTransform: 'capitalize' }}>
                  {role}
                </Typography.Text>
              </Space>
              <MoreOutlined style={{ color: subColor }} />
            </>
          )}
        </div>
      </Dropdown>
    </div>
  );
};

export default SideFooter;
