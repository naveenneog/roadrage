/**
 * Azure OpenAI image generation for game assets.
 *
 * Authenticates with the signed-in Azure CLI identity rather than an API key —
 * nothing secret is written to disk or to the repository. The token is fetched
 * per run and lives only in memory.
 *
 * Usage:
 *   node scripts/gen-assets.mjs --list
 *   node scripts/gen-assets.mjs --only sky-dawn
 *   node scripts/gen-assets.mjs                # generate everything missing
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ENDPOINT = 'https://ai-contosohub530569751908.cognitiveservices.azure.com';
export const DEPLOYMENT = 'gpt-image-2';
export const API_VERSION = '2025-04-01-preview';
const SCOPE = 'https://cognitiveservices.azure.com/.default';

/** Fetch a bearer token from the Azure CLI's cached credentials. */
export const getToken = () => {
  // `az` is a .cmd shim on Windows, so it needs the shell to resolve. Node warns
  // that shell:true concatenates arguments unescaped — safe here because every
  // argument below is a hardcoded constant with no interpolated input.
  const out = execFileSync('az', [
    'account', 'get-access-token', '--scope', SCOPE, '--query', 'accessToken', '-o', 'tsv',
  ], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const token = out.trim();
  if (!token) throw new Error('az returned no token — run "az login" first');
  return token;
};

/**
 * Generate one image. Returns a PNG buffer.
 * `size` must be one of the sizes the deployment supports.
 */
export const generate = async (token, prompt, { size = '1024x1024', quality = 'high' } = {}) => {
  const url = `${ENDPOINT}/openai/deployments/${DEPLOYMENT}/images/generations?api-version=${API_VERSION}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, n: 1, size, quality, output_format: 'png' }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText} — ${text.slice(0, 500)}`);
  }

  const json = await res.json();
  const first = json.data?.[0];
  if (!first) throw new Error(`no image in response: ${JSON.stringify(json).slice(0, 300)}`);
  if (first.b64_json) return Buffer.from(first.b64_json, 'base64');
  if (first.url) {
    const img = await fetch(first.url);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error('response contained neither b64_json nor url');
};

/* ─────────────────────────── the asset brief ─────────────────────────── */

const STYLE =
  'Flat vector game art, bold clean shapes, limited saturated palette, crisp edges, ' +
  'no gradients on small details, no text, no watermark, no people in the foreground. ' +
  'Designed as a seamless horizontal backdrop layer for a retro arcade racing game.';

/**
 * Only backdrop layers are generated. Bikes, riders, traffic and props stay
 * procedural: they need dozens of exact lean and action frames with a
 * transparent background and a fixed pivot, which a text-to-image model cannot
 * hold consistent. Skylines are the opposite — one wide image, drawn once,
 * scrolled behind everything.
 */
export const ASSETS = [
  {
    id: 'skyline-bengaluru',
    size: '1536x1024',
    prompt: `${STYLE} A dawn skyline silhouette of Bengaluru's Shivajinagar district: ` +
      'low colonial cantonment buildings with arched windows, a church steeple, ' +
      'water tanks on flat roofs, rain trees, distant hills. Warm orange and purple ' +
      'dawn sky behind a dark blue-grey silhouette. Horizontal composition, ' +
      'silhouette occupying the lower third.',
  },
  {
    id: 'skyline-mumbai-night',
    size: '1536x1024',
    prompt: `${STYLE} A night skyline of Mumbai Marine Drive: Art Deco apartment blocks ` +
      'with curved balconies, tall modern towers behind, coconut palms, warm yellow ' +
      'window lights scattered across dark silhouettes, deep navy sky. ' +
      'Horizontal composition, silhouette occupying the lower third.',
  },
  {
    id: 'skyline-ghat-monsoon',
    size: '1536x1024',
    prompt: `${STYLE} A monsoon ridge line of the Western Ghats: layered dark green ` +
      'forested hills receding into grey mist, low heavy cloud, a thin waterfall. ' +
      'Muted grey-green palette, flat layered silhouettes for depth. ' +
      'Horizontal composition.',
  },
  {
    id: 'skyline-goa-dusk',
    size: '1536x1024',
    prompt: `${STYLE} A dusk coastal skyline of Goa: leaning coconut palms, a small ` +
      'white Portuguese church tower, low tiled-roof houses, the Arabian Sea flat ' +
      'to the horizon. Orange and pink sunset sky, dark palm silhouettes. ' +
      'Horizontal composition, silhouette occupying the lower third.',
  },
  {
    id: 'skyline-delhi-night',
    size: '1536x1024',
    prompt: `${STYLE} A night skyline of Old Delhi: densely packed flat-roofed havelis, ` +
      'a large mosque with three domes and two minarets, tangled overhead power ' +
      'cables, water tanks. Dark warm silhouette against a hazy amber night sky. ' +
      'Horizontal composition.',
  },
];

/* ─────────────────────────── runner ─────────────────────────── */

const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') ?? '');
if (isMain || process.argv[1]?.includes('gen-assets')) {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const outDir = 'public/generated';

  if (args.includes('--list')) {
    for (const a of ASSETS) console.log(`${a.id.padEnd(24)} ${a.size}`);
    process.exit(0);
  }

  mkdirSync(outDir, { recursive: true });
  const token = getToken();
  console.log(`Azure OpenAI ${DEPLOYMENT} @ ${ENDPOINT.replace('https://', '')}`);

  const manifestPath = join(outDir, 'manifest.json');
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : {};

  for (const asset of ASSETS) {
    if (only && asset.id !== only) continue;
    const file = join(outDir, `${asset.id}.png`);
    if (existsSync(file) && !args.includes('--force')) {
      console.log(`  skip  ${asset.id} (exists)`);
      continue;
    }
    process.stdout.write(`  gen   ${asset.id} ${asset.size} ... `);
    try {
      const png = await generate(token, asset.prompt, { size: asset.size });
      writeFileSync(file, png);
      manifest[asset.id] = {
        size: asset.size,
        bytes: png.length,
        model: DEPLOYMENT,
        generatedAt: new Date().toISOString(),
      };
      console.log(`${(png.length / 1024).toFixed(0)} KB`);
    } catch (error) {
      console.log(`FAILED\n        ${String(error).slice(0, 400)}`);
    }
  }

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nwrote ${outDir}/`);
}
