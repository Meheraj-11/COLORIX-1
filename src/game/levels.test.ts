import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_MAP } from './colors';
import { getAllLevels, TOTAL_LEVEL_COUNT, WORLDS } from './levels';
import {
  aabbOverlap,
  advanceColorLock,
  evaluateColorObjectState,
  traceLightBeams,
  type AABB,
} from './rules';

test('all 8 worlds and 104 playable levels are present with unique titles and valid geometry', () => {
  assert.equal(WORLDS.length, 8);
  assert.equal(TOTAL_LEVEL_COUNT, 104);

  const levels = getAllLevels();
  assert.equal(levels.length, 104);

  const seenNames = new Set<string>();
  const layoutFingerprints = new Set<string>();

  for (let i = 0; i < levels.length; i++) {
    const lvl = levels[i];
    assert.equal(lvl.id, i + 1);
    assert.ok(lvl.worldId >= 1 && lvl.worldId <= 8);
    assert.ok(lvl.name.length > 0, `Level ${lvl.id} missing name`);
    assert.ok(!seenNames.has(lvl.name), `Duplicate level title: ${lvl.name}`);
    seenNames.add(lvl.name);

    // Palette validity
    assert.ok(lvl.palette.length >= 2 && lvl.palette.length <= 8, `Level ${lvl.id} palette size invalid`);
    for (const c of lvl.palette) {
      assert.ok(COLOR_MAP[c], `Invalid color ${c} in level ${lvl.id}`);
    }

    // Spawn & Portal bounds
    assert.ok(lvl.spawn.x >= 20 && lvl.spawn.x < lvl.width - 100, `Level ${lvl.id} spawn out of bounds`);
    assert.ok(lvl.portal.x > lvl.spawn.x + 300 && lvl.portal.x < lvl.width, `Level ${lvl.id} portal invalid`);

    // Verify spawn sits directly above a solid neutral platform and never overlaps hazards/gates/solids
    const hasSpawnFloor = lvl.platforms.some(
      (p) =>
        p.kind === 'neutral' &&
        lvl.spawn.x >= p.x &&
        lvl.spawn.x <= p.x + p.w &&
        p.y >= lvl.spawn.y &&
        p.y <= lvl.spawn.y + 120,
    );
    assert.ok(hasSpawnFloor, `Level ${lvl.id} spawn has no neutral floor beneath it`);
    const spawnBox: AABB = { x: lvl.spawn.x, y: lvl.spawn.y, w: 28, h: 44 };
    for (const p of lvl.platforms) {
      assert.equal(aabbOverlap(spawnBox, p), false, `Level ${lvl.id} spawn overlaps platform ${p.id}`);
    }
    for (const h of lvl.hazards) {
      assert.equal(aabbOverlap(spawnBox, h), false, `Level ${lvl.id} spawn overlaps hazard ${h.id}`);
    }
    for (const g of lvl.gates) {
      assert.equal(aabbOverlap(spawnBox, g), false, `Level ${lvl.id} spawn overlaps gate ${g.id}`);
    }

    // Verify every checkpoint sits on a neutral floor and NEVER overlaps hazards, gates, or walls
    for (const cp of lvl.checkpoints) {
      const onFloor = lvl.platforms.some(
        (p) => p.kind === 'neutral' && cp.x >= p.x + 4 && cp.x <= p.x + p.w - 4 && Math.abs(p.y - cp.y) <= 2,
      );
      assert.ok(onFloor, `Level ${lvl.id} checkpoint ${cp.id} is not standing on a neutral floor`);
      const cpBox: AABB = { x: cp.x - 16, y: cp.y - 48, w: 32, h: 46 };
      for (const h of lvl.hazards) {
        assert.equal(aabbOverlap(cpBox, h), false, `Level ${lvl.id} checkpoint ${cp.id} overlaps hazard ${h.id}`);
      }
      for (const g of lvl.gates) {
        assert.equal(aabbOverlap(cpBox, g), false, `Level ${lvl.id} checkpoint ${cp.id} overlaps gate ${g.id}`);
      }
      for (const p of lvl.platforms) {
        if (Math.abs(p.y - cp.y) <= 2) continue;
        assert.equal(aabbOverlap(cpBox, p), false, `Level ${lvl.id} checkpoint ${cp.id} overlaps platform ${p.id}`);
      }
    }

    // Verify every linked Prism Gate has a matching Color Lock or Light Receptor
    for (const g of lvl.gates) {
      assert.ok(lvl.palette.includes(g.colorId), `Level ${lvl.id} gate ${g.id} color ${g.colorId} not in palette`);
      if (g.unlockMode === 'linked') {
        const hasLock = lvl.locks.some((l) => l.targetGateId === g.id);
        const hasRec = lvl.receptors.some((r) => r.targetGateId === g.id);
        assert.ok(hasLock || hasRec, `Level ${lvl.id} linked gate ${g.id} has no trigger`);
      }
    }

    // Verify every Color Lock sequence is strictly solvable without consecutive duplicate colors
    for (const lk of lvl.locks) {
      let step = 0;
      let unlocked = false;
      for (let k = 0; k < lk.sequence.length; k++) {
        const col = lk.sequence[k];
        assert.ok(lvl.palette.includes(col), `Level ${lvl.id} lock ${lk.id} color ${col} not in palette`);
        if (k > 0) {
          assert.notEqual(col, lk.sequence[k - 1], `Level ${lvl.id} lock ${lk.id} has consecutive duplicate color ${col}`);
        }
        const res = advanceColorLock(lk, step, unlocked, col);
        step = res.step;
        unlocked = res.unlocked;
      }
      assert.equal(unlocked, true, `Level ${lvl.id} lock ${lk.id} did not unlock after sequence`);
    }

    // Verify every Light Receptor can be activated by raycasting under at least one palette color
    for (const rec of lvl.receptors) {
      let canActivate = false;
      for (const activeColor of ['void', ...lvl.palette] as const) {
        const blockers: AABB[] = [];
        for (const p of lvl.platforms) {
          if (evaluateColorObjectState(p.kind, p.colorId, activeColor).solid) blockers.push(p);
        }
        for (const mp of lvl.movingPlatforms) {
          if (evaluateColorObjectState('moving', mp.colorId, activeColor).solid) blockers.push(mp);
        }
        for (const mb of lvl.magneticBlocks) {
          if (evaluateColorObjectState('magnetic', mb.colorId, activeColor).solid) blockers.push(mb);
        }
        const traced = traceLightBeams(lvl.emitters, lvl.mirrors, lvl.receptors, blockers, activeColor, lvl.width, lvl.height);
        if (traced.activatedReceptorIds.has(rec.id)) {
          canActivate = true;
          break;
        }
      }
      assert.ok(canActivate, `Level ${lvl.id} light receptor ${rec.id} cannot be activated by any palette color`);
    }

    // Verify Magnetic Blocks never dissolve when their attraction reactColorId is selected
    for (const mb of lvl.magneticBlocks) {
      assert.notEqual(mb.colorId, mb.reactColorId, `Level ${lvl.id} magnetic block ${mb.id} dissolves on reactColorId`);
      assert.ok(lvl.palette.includes(mb.reactColorId), `Level ${lvl.id} magnetic reactColorId not in palette`);
    }

    // Verify crystals are inside level bounds and clear of neutral solid walls
    assert.ok(lvl.crystals.length >= 1, `Level ${lvl.id} should have at least 1 collectible crystal`);
    for (const c of lvl.crystals) {
      assert.ok(c.x > 0 && c.x < lvl.width && c.y > 0 && c.y < lvl.height, `Crystal out of bounds in L${lvl.id}`);
      const cBox: AABB = { x: c.x - 10, y: c.y - 10, w: 20, h: 20 };
      for (const p of lvl.platforms) {
        if (p.kind === 'neutral') {
          assert.equal(aabbOverlap(cBox, p), false, `Level ${lvl.id} crystal ${c.id} embedded in neutral platform ${p.id}`);
        }
      }
    }

    // Verify monsters exist, use valid palette vulnerability colors, have valid patrol bounds, and never overlap walls/hazards/gates/spawn
    assert.ok(lvl.monsters.length >= 1, `Level ${lvl.id} should have at least 1 patrolling monster`);
    for (const m of lvl.monsters) {
      const mw = m.w ?? 36;
      const mh = m.h ?? 32;
      assert.ok(COLOR_MAP[m.vulnerableColor], `Invalid monster vulnerableColor ${m.vulnerableColor} in L${lvl.id}`);
      assert.ok(lvl.palette.includes(m.vulnerableColor), `Monster ${m.id} color ${m.vulnerableColor} not in L${lvl.id} palette`);
      assert.ok(m.patrolMaxX > m.patrolMinX + 40, `Monster ${m.id} patrol lane too narrow in L${lvl.id}`);
      assert.ok(m.x >= m.patrolMinX && m.x <= m.patrolMaxX, `Monster ${m.id} start x outside patrol in L${lvl.id}`);
      assert.ok(m.speed > 0, `Monster ${m.id} speed invalid in L${lvl.id}`);
      const distToSpawn = Math.hypot(m.x - lvl.spawn.x, m.y - lvl.spawn.y);
      assert.ok(distToSpawn >= 140, `Monster ${m.id} too close to spawn in L${lvl.id} (${distToSpawn})`);

      const floor = lvl.platforms.find(
        (p) => p.kind === 'neutral' && Math.abs(p.y - m.y) <= 2 && p.x <= m.patrolMinX + 2 && p.x + p.w >= m.patrolMaxX - 2,
      );
      assert.ok(floor, `Monster ${m.id} patrol extends off neutral floor in L${lvl.id}`);
      const patrolBox: AABB = { x: m.patrolMinX, y: m.y - mh, w: m.patrolMaxX - m.patrolMinX, h: mh };
      for (const h of lvl.hazards) {
        assert.equal(aabbOverlap(patrolBox, h), false, `Monster ${m.id} patrol overlaps hazard ${h.id} in L${lvl.id}`);
      }
      for (const g of lvl.gates) {
        assert.equal(aabbOverlap(patrolBox, g), false, `Monster ${m.id} patrol overlaps gate ${g.id} in L${lvl.id}`);
      }
      for (const p of lvl.platforms) {
        if (Math.abs(p.y - m.y) <= 2) continue;
        assert.equal(aabbOverlap(patrolBox, p), false, `Monster ${m.id} patrol overlaps wall ${p.id} in L${lvl.id}`);
      }
      assert.ok(mw > 0 && mh > 0);
    }

    // Verify Spawn -> Portal traversability graph under game jump physics
    type Node = { x1: number; x2: number; y: number };
    const nodes: Node[] = [];
    for (const p of lvl.platforms) {
      if (p.kind === 'neutral' || p.kind === 'color_block' || p.kind === 'bridge') {
        if (p.w <= 60 && p.h >= 100) continue;
        nodes.push({ x1: p.x, x2: p.x + p.w, y: p.y });
      }
    }
    for (const mp of lvl.movingPlatforms) {
      nodes.push({ x1: Math.min(mp.x, mp.toX), x2: Math.max(mp.x, mp.toX) + mp.w, y: Math.min(mp.y, mp.toY) });
      nodes.push({ x1: Math.min(mp.x, mp.toX), x2: Math.max(mp.x, mp.toX) + mp.w, y: Math.max(mp.y, mp.toY) });
    }
    for (const mb of lvl.magneticBlocks) {
      nodes.push({ x1: Math.min(mb.x, mb.toX), x2: Math.max(mb.x, mb.toX) + mb.w, y: Math.min(mb.y, mb.toY) });
      nodes.push({ x1: Math.min(mb.x, mb.toX), x2: Math.max(mb.x, mb.toX) + mb.w, y: Math.max(mb.y, mb.toY) });
    }
    const startIdx = nodes.findIndex(
      (n) => lvl.spawn.x >= n.x1 && lvl.spawn.x <= n.x2 && n.y >= lvl.spawn.y && n.y <= lvl.spawn.y + 110,
    );
    const goalIdx = nodes.findIndex(
      (n) => lvl.portal.x >= n.x1 && lvl.portal.x <= n.x2 && n.y >= lvl.portal.y && n.y <= lvl.portal.y + 110,
    );
    assert.ok(startIdx !== -1 && goalIdx !== -1, `Level ${lvl.id} missing traversable start/goal node`);
    const visited = new Set<number>([startIdx]);
    const queue = [startIdx];
    const maxJumpUp = lvl.worldId >= 4 ? 175 : 105;
    while (queue.length > 0) {
      const cur = nodes[queue.shift()!];
      for (let j = 0; j < nodes.length; j++) {
        if (visited.has(j)) continue;
        const nxt = nodes[j];
        const horizGap = Math.max(0, nxt.x1 - cur.x2, cur.x1 - nxt.x2);
        const dyUp = cur.y - nxt.y;
        if (dyUp > maxJumpUp) continue;
        const maxGap = dyUp > 50 ? 155 : dyUp >= 0 ? 195 : 240;
        if (horizGap <= maxGap) {
          visited.add(j);
          queue.push(j);
        }
      }
    }
    assert.ok(visited.has(goalIdx), `Level ${lvl.id} portal unreachable from spawn`);

    // Check layout diversity
    const fp = `${lvl.width}:${lvl.platforms.length}:${lvl.movingPlatforms.length}:${lvl.gates.length}:${lvl.locks.length}:${lvl.magneticBlocks.length}:${lvl.emitters.length}:${lvl.palette.join(',')}`;
    layoutFingerprints.add(fp);
  }

  // Ensure rich layout variety across the 104 levels
  assert.ok(layoutFingerprints.size >= 80, `Expected high layout diversity, got ${layoutFingerprints.size}`);
});

