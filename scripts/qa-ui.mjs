/**
 * UI integrity QA.
 *
 * Walks every out-of-race screen and asserts that nothing is clipped, nothing
 * overflows the viewport, and every control is reachable and large enough to
 * hit on a phone.
 *
 * This exists because the garage shipped with all twelve bike cards clipped to
 * 121 px of a needed 250-280 px, painting each card's text over the one below
 * it. Every other harness passed: the page had no console errors, the right
 * number of sprites drew, and the frame rate was fine. Only a human looking at
 * a screenshot caught it, and only once someone thought to open that screen.
 *
 *   node scripts/qa-ui.mjs [url]
 */
import { chromium, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';

/** Minimum comfortable touch target, per the usual mobile guidance. */
const MIN_TAP_PX = 40;
/** Sub-pixel layout rounding shows up as a pixel or two of phantom overflow. */
const SLACK = 3;

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900, tap: false },
  { name: 'laptop-1280', width: 1280, height: 720, tap: false },
  { name: 'phone-landscape', ...devices['Pixel 5 landscape'].viewport, tap: true },
];

/**
 * Screens reachable from the title, and how to get to each one. Kept as data so
 * adding a screen to the game means adding one line here.
 */
const ROUTES = [
  { id: 'title', path: [] },
  { id: 'garage', path: [/garage/i] },
  { id: 'circuits', path: [/^race$/i] },
  { id: 'campaign', path: [/auto rickshaw|campaign|edition/i] },
  { id: 'settings', path: [/settings/i] },
];

const gotoScreen = async (page, route) => {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
  for (const pattern of route.path) {
    const clicked = await page.evaluate((src) => {
      const re = new RegExp(src.source, src.flags);
      const btn = [...document.querySelectorAll('button')]
        .find((b) => re.test(b.textContent || '') && !b.disabled);
      if (!btn) return false;
      btn.click();
      return true;
    }, { source: pattern.source, flags: pattern.flags });
    if (!clicked) return false;
    await page.waitForTimeout(500);
  }
  return true;
};

const auditScreen = ({ minTap, slack, wantTap }) => {
  const problems = [];
  const root = document.querySelector('#screens') ?? document.body;
  const nodes = [...root.querySelectorAll('*')];

  const label = (n) => {
    const text = (n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 42);
    return `${n.tagName.toLowerCase()}${n.className ? '.' + String(n.className).split(' ')[0] : ''}` +
      (text ? ` "${text}"` : '');
  };

  /**
   * True when some ancestor scrolls horizontally. Content parked outside the
   * viewport inside a scrolling rail is reachable, so it is not a defect — only
   * content with no way to bring it into view is.
   */
  const inScrollerX = (n) => {
    for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
    return false;
  };

  for (const n of nodes) {
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rect = n.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    // Content taller than its box, with no way to scroll to the rest, is
    // clipped — and because overflow is visible it paints over its neighbour.
    const scrollableY = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
    const scrollableX = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    if (!scrollableY && n.scrollHeight > n.clientHeight + slack && n.clientHeight > 0) {
      problems.push(`clipped-y ${label(n)} (needs ${n.scrollHeight}px, has ${n.clientHeight}px)`);
    }
    if (!scrollableX && n.scrollWidth > n.clientWidth + slack && n.clientWidth > 0) {
      problems.push(`clipped-x ${label(n)} (needs ${n.scrollWidth}px, has ${n.clientWidth}px)`);
    }

    // Anything pushed outside the viewport with no way to scroll to it.
    if (!inScrollerX(n) && (rect.right > innerWidth + slack || rect.left < -slack)) {
      problems.push(`offscreen-x ${label(n)} (${Math.round(rect.left)}..${Math.round(rect.right)} vs ${innerWidth})`);
    }

    if (wantTap && n.tagName === 'BUTTON' && !n.disabled) {
      if (rect.height < minTap - slack) {
        problems.push(`tap-target ${label(n)} (${Math.round(rect.height)}px tall, want ${minTap})`);
      }
    }
  }

  // The page itself must not scroll sideways.
  if (document.documentElement.scrollWidth > innerWidth + slack) {
    problems.push(`page-overflow-x (${document.documentElement.scrollWidth} vs ${innerWidth})`);
  }

  /*
   * Sibling overlap.
   *
   * This is the check that actually matches what a person sees. An element can
   * pass every clipping test — its own content fits its own box — and still be
   * painted straight through its neighbour because the box overflows the grid
   * cell it was assigned. That is exactly how the bike and chapter cards broke,
   * and why "no clipped content" was not a strong enough invariant.
   */
  const seen = new Set();
  for (const n of nodes) {
    const kids = [...n.children].filter((k) => {
      const cs = getComputedStyle(k);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (cs.position === 'absolute' || cs.position === 'fixed') return false;
      const r = k.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect();
        const b = kids[j].getBoundingClientRect();
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > slack && overlapY > slack) {
          const key = `${label(kids[i])}|${label(kids[j])}`;
          if (seen.has(key)) continue;
          seen.add(key);
          problems.push(
            `overlap ${label(kids[i])} × ${label(kids[j])} ` +
            `(${Math.round(overlapX)}×${Math.round(overlapY)}px)`,
          );
        }
      }
    }
  }
  return problems;
};

const run = async () => {
  const browser = await chromium.launch();
  let failures = 0;
  const rows = [];

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    for (const route of ROUTES) {
      const reached = await gotoScreen(page, route);
      if (!reached) {
        rows.push({ vp: vp.name, screen: route.id, status: 'skip', detail: 'route not found' });
        continue;
      }
      const problems = await page.evaluate(auditScreen, {
        minTap: MIN_TAP_PX, slack: SLACK, wantTap: vp.tap,
      });

      const list = Array.isArray(problems) ? problems : [];
      if (list.length) failures += list.length;
      rows.push({ vp: vp.name, screen: route.id, status: list.length ? 'FAIL' : 'ok', detail: list });
      await page.screenshot({ path: `qa-ui/${vp.name}-${route.id}.png` });
    }
    if (errors.length) {
      failures += errors.length;
      rows.push({ vp: vp.name, screen: '-', status: 'FAIL', detail: [`console: ${errors[0]}`] });
    }
    await page.close();
  }

  await browser.close();

  console.log('\n─── UI integrity ───');
  for (const r of rows) {
    const detail = Array.isArray(r.detail) ? r.detail : [r.detail];
    console.log(`  ${r.status.padEnd(4)} ${r.vp.padEnd(16)} ${r.screen.padEnd(10)} ${detail.length && r.status !== 'ok' ? detail.length + ' issue(s)' : ''}`);
    if (r.status === 'FAIL') for (const d of detail.slice(0, 6)) console.log(`         · ${d}`);
  }

  if (failures) {
    console.log(`\nFAILED — ${failures} issue(s). Screenshots in ./qa-ui\n`);
    process.exit(1);
  }
  console.log('\nPASSED — no clipped, overflowing or unreachable UI. Screenshots in ./qa-ui\n');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
