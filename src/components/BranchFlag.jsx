import { useLanguage } from '../Language';
import './BranchFlag.css';

export default function BranchFlag({ branch }) {
  const { t } = useLanguage();
  if (!branch.flag) return null;
  const label = branch.role === '总社'
    ? t('{0}{1}旗帜', [branch.school, branch.role])
    : t('{0}旗帜', [branch.name]);
  return <figure className="branch-flag"><img src={branch.flag} alt={label} /></figure>;
}
