import { siteRows } from '../editorial/content.js';
// Newly featured photos come first, in the order supplied by the user.
// User-supplied captions: title is displayed first; organization follows below
// and may include a series suffix after ｜.
export const activityPhotos = [
  { id: 'activity-13', src: '/images/activity-photos/activity-13-kaiwu-group.jpg', width: 540, height: 960, alt: '开物·福州高校黑客松「零一」合照',
    title: '开物·福州高校黑客松', organization: '零一黑客松｜「零一」合照' },
  { id: 'activity-14', src: '/images/activity-photos/activity-14-kaiwu-venue.jpg', width: 720, height: 960, alt: '开物·福州高校黑客松比赛现场',
    title: '开物·福州高校黑客松', organization: '零一黑客松｜比赛现场' },
  { id: 'activity-15', src: '/images/activity-photos/activity-15-kaiwu-speech.jpg', width: 720, height: 960, alt: '开物·福州高校黑客松社长「零一扬」演讲',
    title: '开物·福州高校黑客松', organization: '零一黑客松｜社长「零一扬」演讲' },
  { id: 'activity-16', src: '/images/activity-photos/activity-16-kaiwu-venue.jpg', width: 720, height: 960, alt: '开物·福州高校黑客松比赛现场',
    title: '开物·福州高校黑客松', organization: '零一黑客松｜比赛现场' },
  { id: 'activity-01', src: '/images/activity-photos/activity-01.jpg', width: 960, height: 442, alt: '零一玩家室内活动合影',
    organization: '零一沙龙｜AI 商业锐评会', title: '是自嗨玩具？还是商业产品？带上你的项目来锐评！' },
  { id: 'activity-02', src: '/images/activity-photos/activity-02.jpg', width: 960, height: 960, alt: '室内围桌交流活动现场拼图',
    organization: '零一沙龙｜AI 商业锐评会', title: '是自嗨玩具？还是商业产品？带上你的项目来锐评！' },
  { id: 'activity-03', src: '/images/activity-photos/activity-03.jpg', width: 960, height: 696, alt: '夜间户外交流现场',
    organization: '零一沙龙｜AI 科研锐评会', title: '论文是 AI 写的，科研是谁做的？' },
  { id: 'activity-04', src: '/images/activity-photos/activity-04.jpg', width: 960, height: 719, alt: '教室交流活动现场拼图',
    organization: '零一沙龙｜AI 科研锐评会', title: '论文是 AI 写的，科研是谁做的？' },
  { id: 'activity-05', src: '/images/activity-photos/activity-05.jpg', width: 960, height: 539, alt: '校园建筑前的活动合影',
    organization: '零一沙龙｜AI 科研锐评会', title: '论文是 AI 写的，科研是谁做的？' },
  { id: 'activity-06', src: '/images/activity-photos/activity-06.jpg', width: 960, height: 720, alt: '围桌交流活动现场拼图',
    organization: '零一沙龙｜梦开始的地方', title: 'AI时代除了成为好学生，我们还能成为谁？' },
  { id: 'activity-07', src: '/images/activity-photos/activity-07.jpg', width: 960, height: 467, alt: '展示社团旗帜的户外活动合影',
    organization: '零一沙龙｜福州大学社团巡礼', title: '记二零二六社团巡礼纳新：技术进步，如何成为每个人从零到一的机会？' },
  { id: 'activity-08', src: '/images/activity-photos/activity-08.jpg', width: 960, height: 473, alt: '教室内的社团活动合影',
    organization: '零一沙龙｜梦开始的地方', title: 'AI时代除了成为好学生，我们还能成为谁？' },
  { id: 'activity-09', src: '/images/activity-photos/activity-09.jpg', width: 913, height: 960, alt: '室内活动合影',
    organization: '日常活动｜「零一」首次“聚餐耍起”', title: '一群志同道合的兄弟，难得开心的一天！' },
  { id: 'activity-10', src: '/images/activity-photos/activity-10.jpg', width: 960, height: 960, alt: '社团活动展位交流现场拼图',
    organization: '零一沙龙｜福州大学社团巡礼', title: '记二零二六社团巡礼纳新：技术进步，如何成为每个人从零到一的机会？' },
  { id: 'activity-11', src: '/images/activity-photos/activity-11.jpg', width: 960, height: 960, alt: '活动展位的饮品制作与交流现场拼图',
    organization: '零一沙龙｜福州大学社团巡礼', title: '记二零二六社团巡礼纳新：技术进步，如何成为每个人从零到一的机会？' },
  { id: 'activity-12', src: '/images/activity-photos/activity-12.jpg', width: 960, height: 960, alt: '活动展位的电脑演示与交流现场拼图',
    organization: '零一沙龙｜福州大学社团巡礼', title: '记二零二六社团巡礼纳新：技术进步，如何成为每个人从零到一的机会？' }
];

export function getActivityPhotos() {
  return siteRows('activityPhotos', activityPhotos);
}
