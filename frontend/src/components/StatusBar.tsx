import { TbLayoutColumns, TbFileCode, TbCircleCheck } from 'react-icons/tb';

type StatusBarProps = {
  infopans: string;
  folder_files: string;
  state: string;
};

export function StatusBar({ infopans, folder_files, state }: StatusBarProps) {
  return (
    <div className="statusbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div className="si"><TbLayoutColumns style={{ fontSize: '12px' }} /> {infopans}</div>
        <div className="si"><TbFileCode style={{ fontSize: '12px' }} /> {folder_files}</div>
      </div>
      <div className="si ok"><TbCircleCheck style={{ fontSize: '12px' }} /> {state}</div>
    </div>
  );
}