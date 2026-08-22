import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';

const http = httpRouter();

// POST /upload?token=<session token>
// The Pi (or a laptop webcam as the hardware fallback) posts a single frame as
// the raw request body. We store the bytes in Convex file storage, then insert a
// `photos` row via an internal mutation (actions have no ctx.db). Same endpoint
// for both capture paths — keep it working all weekend (demo-plan §4).
const upload = httpAction(async (ctx, request) => {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) {
    return new Response('Missing ?token', { status: 400 });
  }

  const blob = await request.blob();
  if (blob.size === 0) {
    return new Response('Empty body', { status: 400 });
  }

  const storageId = await ctx.storage.store(blob);
  const photoId = await ctx.runMutation(internal.sessions.addPhoto, { token, storageId });
  if (photoId === null) {
    return new Response('Unknown session token', { status: 404 });
  }

  return Response.json({ photoId });
});

http.route({ path: '/upload', method: 'POST', handler: upload });

export default http;
