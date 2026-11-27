// Keep the customized GET handler when updating the Payload route scaffold.
import config from '@payload-config'
import '@payloadcms/next/css'
import { stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { dir } from '../../../../env.mjs'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'

const payloadGet = REST_GET(config)
export const GET: typeof payloadGet = async (request, context) => {
  const response = await payloadGet(request, context)
  if (response.status !== 500) return response
  const { slug } = await context.params
  if (!slug || slug.length !== 3 || slug[0] !== 'media' || slug[1] !== 'file') return response
  const filename = slug[2]
  if (!filename || basename(filename) !== filename || filename === '.' || filename === '..') return response
  // Payload 3.94 returns 500 for an absent local file, including files deleted normally.
  // Preserve genuine database, permission and storage failures as server errors.
  try { await stat(resolve(dir, 'media', filename)) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return Response.json({ errors: [{ message: '素材不存在。' }] }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }
  }
  return response
}
export const POST = REST_POST(config)
export const DELETE = REST_DELETE(config)
export const PATCH = REST_PATCH(config)
export const PUT = REST_PUT(config)
export const OPTIONS = REST_OPTIONS(config)
