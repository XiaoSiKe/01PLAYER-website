import { buildConfig, APIError } from 'payload';
import { sqliteAdapter } from '@payloadcms/db-sqlite';
import { zh } from '@payloadcms/translations/languages/zh';
import sharp from 'sharp';
import { resolve } from 'node:path';
import { playerIdentityLabels } from '../../src/community/account/identity.js';
import { operationsName } from './branding.mjs';
import { dir, localSecret } from './env.mjs';
import catalog from './content/catalog.json';
import { endpoints, usage } from './content/endpoints.mjs';
import {
  publishedImage,
  saveManifest,
  mergeSection,
  forgetImage,
  restorePublishedContent,
} from './content/model.mjs';
import { validateRows, mergeCatalogDefaults } from './content/rules.mjs';
const staff = ({ req }: any) =>
  req.user?.collection === 'staff' && ['owner', 'operator'].includes(req.user.role);
const owner = ({ req }: any) => req.user?.collection === 'staff' && req.user.role === 'owner';
export default buildConfig({
  secret: localSecret('payload.key', 'PAYLOAD_SECRET'),
  sharp,
  routes: { admin: '/admin', api: '/cms-api' },
  graphQL: { disable: true },
  i18n: { supportedLanguages: { zh }, fallbackLanguage: 'zh' },
  db: sqliteAdapter({
    client: { url: 'file:' + resolve(dir, 'cms.sqlite') },
    push: process.env.NODE_ENV !== 'production',
  }),
  admin: {
    user: 'staff',
    importMap: { baseDir: resolve(process.cwd(), 'src') },
    meta: { titleSuffix: ' · ' + operationsName },
    components: {
      providers: ['/components/OfficialUI.jsx#OfficialTheme'],
      graphics: { Logo: '/components/Brand.jsx#Logo', Icon: '/components/Brand.jsx#Icon' },
      beforeNavLinks: ['/components/DeskNav.jsx'],
      logout: { Button: '/components/DeskNav.jsx#DeskAccountControls' },
      header: ['/components/DeskNav.jsx#DeskNavExpand'],
      views: {
        dashboard: { Component: '/components/StaffViews.jsx#DashboardView' },
        login: { Component: '/components/StaffLogin.jsx', path: '/login' },
        forgot: { Component: '/components/StaffPasswordHelp.jsx', path: '/forgot' },
        guide: { Component: '/components/StaffViews.jsx#GuideView', path: '/guide' },
        research: { Component: '/components/StaffViews.jsx#ResearchView', path: '/research' },
        operations: { Component: '/components/StaffViews.jsx#OperationsView', path: '/operations' },
        communityUsers: { Component: '/components/StaffViews.jsx#UsersView', path: '/community-users' },
        mobilePreview: { Component: '/components/StaffViews.jsx#PreviewView', path: '/content-preview' },
      },
    },
  },
  typescript: { outputFile: resolve(process.cwd(), 'src/payload-types.ts') },
  endpoints: endpoints as any,
  collections: [
    {
      slug: 'staff',
      labels: { singular: '运营账号', plural: '运营账号' },
      auth: { maxLoginAttempts: 8, lockTime: 600000 },
      admin: { useAsTitle: 'email', hidden: true },
      access: {
        admin: staff,
        create: owner,
        read: ({ req }: any) =>
          owner({ req }) || (staff({ req }) ? { id: { equals: req.user.id } } : false),
        update: owner,
        delete: owner,
      },
      fields: [
        {
          name: 'role',
          type: 'select',
          label: '身份',
          defaultValue: 'operator',
          admin: { hidden: true },
          required: true,
          options: [
            { label: playerIdentityLabels.pioneer, value: 'operator' },
            { label: playerIdentityLabels.head, value: 'owner' },
          ],
        },
      ],
      hooks: {
        beforeOperation: [
          ({ args, operation, req }) => {
            if (operation === 'forgotPassword' && !args.disableEmail && req.payload.email.name === 'console')
              throw new APIError('请联系头号玩家重置运营密码。', 409);
          },
        ],
        beforeDelete: [
          async ({ id, req }) => {
            if (String(req.user?.id) === String(id)) throw new APIError('不能删除当前账号', 400);
          },
        ],
        beforeChange: [
          ({ data, originalDoc, req }) => {
            if (
              originalDoc?.role === 'owner' &&
              String(originalDoc.id) === String(req.user?.id) &&
              data.role === 'operator'
            )
              throw new APIError('不能撤销自己的头号玩家权限。', 400);
            return data;
          },
        ],
      },
    },
    {
      slug: 'sections',
      labels: { singular: '网站栏目', plural: '网站内容' },
      admin: {
        useAsTitle: 'title',
        group: '内容运营',
        defaultColumns: ['title', 'updatedAt', '_status'],
      },
      access: {
        read: staff,
        create: () => false,
        update: staff,
        delete: () => false,
        readVersions: staff,
      },
      versions: { drafts: true, maxPerDoc: 16 },
      fields: [
        { name: 'title', type: 'text', label: '栏目', required: true, admin: { readOnly: true } },
        { name: 'sectionKey', type: 'text', unique: true, required: true, admin: { hidden: true } },
        { name: 'previewPath', type: 'text', admin: { hidden: true } },
        { name: 'preview', type: 'ui', admin: { components: { Field: '/components/Preview.jsx' } } },
        {
          name: 'rows',
          label: '栏目内容',
          type: 'json',
          required: true,
          admin: { components: { Field: '/components/RowsField.jsx' } },
        },
      ],
      hooks: {
        afterRead: [
          ({ doc }) => {
            const base = catalog.find((item) => item.key === doc.sectionKey);
            if (base && Array.isArray(doc.rows))
              doc.rows = mergeCatalogDefaults(doc.sectionKey, doc.rows, base.rows);
            return doc;
          },
        ],
        beforeChange: [
          ({ data, originalDoc }) => {
            if (originalDoc?.sectionKey) {
              data.sectionKey = originalDoc.sectionKey;
              data.previewPath = originalDoc.previewPath;
              data.title = originalDoc.title;
            }
            const defaults = catalog.find((item) => item.key === data.sectionKey)?.rows;
            const ok = validateRows(data.rows ?? originalDoc?.rows, data.sectionKey, defaults);
            if (ok !== true) throw new APIError(ok, 400);
            return data;
          },
        ],
        afterChange: [
          ({ doc, context }) => {
            if (doc._status === 'published' && !context.seed)
              saveManifest((s: any) => mergeSection(s, doc.sectionKey, doc.rows));
            return doc;
          },
        ],
      },
    },
    {
      slug: 'media',
      labels: { singular: '素材', plural: '素材库' },
      admin: { group: '内容运营', useAsTitle: 'alt' },
      access: {
        read: (args) => args.isReadingStaticFile === true || staff(args),
        create: staff,
        update: staff,
        delete: owner,
      },
      upload: {
        staticDir: resolve(dir, 'media'),
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
        imageSizes: [
          { name: 'thumb', width: 240, withoutEnlargement: true },
          { name: 'card', width: 640, withoutEnlargement: true },
          { name: 'wide', width: 1280, withoutEnlargement: true },
        ],
        adminThumbnail: 'thumb',
      },
      fields: [
        { name: 'alt', label: '图片说明', type: 'text', required: true },
        { name: 'usage', type: 'ui', admin: { components: { Field: '/components/Usage.jsx' } } },
      ],
      hooks: {
        beforeChange: [
          ({ operation, req, data }) => {
            if (operation === 'update' && req.file)
              throw new APIError('请将替换图片上传为新素材，以保留旧版本。', 400);
            return data;
          },
        ],
        afterChange: [
          ({ doc }) => {
            publishedImage(doc);
            return doc;
          },
        ],
        beforeDelete: [
          async ({ id, req }) => {
            const doc = await req.payload.findByID({ collection: 'media', id, req });
            if ((await usage(req, doc)).length)
              throw new APIError('请先替换页面中使用的素材，再移除。', 409);
          },
        ],
        afterDelete: [
          ({ doc }) => {
            saveManifest((old: any) => {
              const images = { ...old.images };
              forgetImage(doc.url);
              delete images[doc.url];
              return { ...old, images };
            });
            return doc;
          },
        ],
      },
    },
  ],
  upload: { limits: { fileSize: 16 * 1024 * 1024 } },
  onInit: async (payload) => {
    const existing = await payload.count({ collection: 'staff' });
    if (!existing.totalDocs) {
      const dev =
        process.env.NODE_ENV !== 'production' ||
        (process.env.CLUB_LOCAL_PREVIEW === '1' && process.env.NEXT_PHASE === 'phase-production-build');
      const email = process.env.CMS_OWNER_EMAIL || (dev ? 'operator@01player.test' : '');
      const password =
        process.env.CMS_OWNER_PASSWORD ||
        (dev ? localSecret('preview-password', 'CMS_OWNER_PASSWORD') : '');
      if (!email || password.length < 12)
        throw Error('首次启动需设置 CMS_OWNER_EMAIL 和至少 12 位的 CMS_OWNER_PASSWORD');
      await payload.create({
        collection: 'staff',
        data: { email, password, role: 'owner' },
        overrideAccess: true,
      });
    }
    const current = await payload.find({
      collection: 'sections',
      limit: 100,
      pagination: false,
      depth: 0,
    });
    const keys = new Set(current.docs.map((s) => s.sectionKey));
    for (const seed of catalog)
      if (!keys.has(seed.key))
        await payload.create({
          collection: 'sections',
          overrideAccess: true,
          context: { seed: true },
          data: {
            sectionKey: seed.key,
            title: seed.title,
            previewPath: seed.path,
            rows: seed.rows,
            _status: 'published',
          },
        });
    await restorePublishedContent(payload, catalog);
  },
});
