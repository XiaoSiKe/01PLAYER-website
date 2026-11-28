import { FiArrowUpRight } from 'react-icons/fi';
import { DetailBack, Empty, Frame, ProjectGrid } from '../CommunityUi';
import { communityLink as link } from '../api';

export default function PublicPlayer({ profile, events, back }) {
  return <article className="public-player-page">
    <div className="community-page-return"><DetailBack href={back} inline shineOnInteraction>返回</DetailBack></div>
    {profile ? <>
      <header className="public-player-heading">
        <div className="public-player-avatar">{profile.avatar ? <img src={profile.avatar} alt={profile.name+'的头像'} /> : <span aria-label="默认头像">{Array.from(profile.name)[0]}</span>}</div>
        <div><h1>{profile.name}</h1><p>{profile.university || '大学未填写'}</p>{profile.publicContact && <p className="public-player-contact">联系方式：{profile.publicContact}</p>}</div>
      </header>
      <section aria-labelledby="public-player-projects"><h2 id="public-player-projects">公开作品</h2>
        <ProjectGrid projects={profile.projects} events={events} empty="暂未发布公开作品。" />
      </section>
      {profile.recruitments.length > 0 && <section aria-labelledby="public-player-recruitments"><h2 id="public-player-recruitments">组队招募</h2>
        {profile.recruitments.length ? <div className="public-player-recruitments">{profile.recruitments.map(team => <Frame
          as="a" key={team.id} radius={10} flush className="community-team-link" href={link('players',{event:team.eventId,recruit:team.id})}>
          <h3 className="community-team-project"><span>{team.projectName}</span><FiArrowUpRight aria-hidden="true" /></h3>
          <p className="community-team-summary">{Array.from(team.description || '').slice(0,30).join('')}</p>
        </Frame>)}</div> : null}
      </section>}
    </> : <Empty>该玩家暂无公开主页。</Empty>}
  </article>;
}
