import { useAppContext } from "../contexts/AppContext";
import { TbFolder, TbX,TbGitBranch } from "react-icons/tb";

type PanelHeaderProps = {
  title: string;        // "ml_thesis", "embedded", etc.
  badge?: string;       // "Python", "C++", "JS"
  id: string;           // unique identifier for the panel
  gitBranch?: string;  // current branch name if in a git repo
  gitDirty?: boolean;  // whether the repo has uncommitted changes
  gitFiles?: { path: string; status: string }[]; // list of files with git status
};

export function PanelHeader({ title, badge, id, gitBranch, gitDirty }: PanelHeaderProps) {
  const { removePanel } = useAppContext();

  const getBadgeClass = (badge: string) => {
    const map: Record<string, string> = {
      'Python': 'py',
      'C++': 'cpp',
      'JS': 'js',
    };
    return map[badge] || badge.toLowerCase();
  };

  return (
    <div className="panel-header">
      <div className="panel-title">
        <TbFolder style={{ fontSize: '13px', color: 'rgba(240,120,50,0.55)' }} />
        <span>{title}</span>
        {badge && <span className={`badge ${getBadgeClass(badge)}`}>{badge}</span>}
        {gitBranch && (
          <span className={`git-badge ${gitDirty ? 'dirty' : 'clean'}`}>
            <TbGitBranch style={{ 
              fontSize: '12px', 
              marginRight: '3px',
              verticalAlign: 'middle'
            }} />
            {gitBranch}
            {gitDirty && (
              <span className="git-dirty-dot">•</span>
            )}
          </span>
        )}
      </div>
      <button 
        onClick={(e) => {
          e.stopPropagation();
          removePanel(id);
        }}
        className="tb-btn"
        style={{ padding: '2px 4px' }}
        aria-label="close"
      >
        <TbX style={{ fontSize: '11px' }} />
      </button>
    </div>
  );
}