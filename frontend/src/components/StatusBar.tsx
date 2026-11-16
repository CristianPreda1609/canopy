import { TbLayoutColumns, TbFileCode, TbCircleCheck, TbDownload, TbLoader2, TbAlertTriangle } from 'react-icons/tb';
import { useAppContext } from '../contexts/AppContext';

type StatusBarProps = {
  infopans: string;
  folder_files: string;
  state: string;
};

/** Right side of the status bar: update notifications, otherwise app status. */
function UpdateIndicator({ fallback }: { fallback: string }) {
  const { state, installUpdate } = useAppContext();
  const u = state.update;
  switch (u.status) {
    case 'checking':
      return <div className="si"><TbLoader2 className="spin" style={{ fontSize: '12px' }} /> checking for updates…</div>;
    case 'up-to-date':
      return <div className="si ok"><TbCircleCheck style={{ fontSize: '12px' }} /> up to date</div>;
    case 'available':
      return (
        <button className="update-pill" onClick={installUpdate} title="Download, install and restart">
          <TbDownload style={{ fontSize: '12px' }} /> update to v{u.version}
        </button>
      );
    case 'installing':
      return (
        <div className="si">
          <TbLoader2 className="spin" style={{ fontSize: '12px' }} />
          installing v{u.version}{u.progress !== null ? ` · ${Math.round(u.progress * 100)}%` : '…'}
        </div>
      );
    case 'error':
      return <div className="si warn"><TbAlertTriangle style={{ fontSize: '12px' }} /> {u.message}</div>;
    default:
      return <div className="si ok"><TbCircleCheck style={{ fontSize: '12px' }} /> {fallback}</div>;
  }
}

export function StatusBar({ infopans, folder_files, state }: StatusBarProps) {
  return (
    <div className="statusbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
        <div className="si"><TbLayoutColumns style={{ fontSize: '12px' }} /> {infopans}</div>
        <div className="si si-path"><TbFileCode style={{ fontSize: '12px' }} /> {folder_files}</div>
      </div>
      <UpdateIndicator fallback={state} />
    </div>
  );
}
