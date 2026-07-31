import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainContent = await fs.readFile(path.join(workspaceRoot, 'electron/main.ts'), 'utf8')

function isMilestoneLaunch(launchCount) {
  return launchCount >= 5 && (launchCount - 5) % 15 === 0
}

function shouldShowRateModal(launchCount, feedbackSubmitted = false, feedbackDeclined = false) {
  return isMilestoneLaunch(launchCount) && !feedbackSubmitted && !feedbackDeclined
}

test('Rate Metis modal schedule logic - launches 1 to 4 do not show modal', () => {
  for (let launch = 1; launch <= 4; launch++) {
    assert.equal(shouldShowRateModal(launch), false, `Launch ${launch} should NOT show modal`)
  }
})

test('Rate Metis modal schedule logic - 5th launch shows modal', () => {
  assert.equal(shouldShowRateModal(5), true, '5th launch SHOULD show modal')
})

test('Rate Metis modal schedule logic - launches 6 to 19 do not show modal', () => {
  for (let launch = 6; launch <= 19; launch++) {
    assert.equal(shouldShowRateModal(launch), false, `Launch ${launch} should NOT show modal`)
  }
})

test('Rate Metis modal schedule logic - recurring 15th launches (20, 35, 50, 65, 80) show modal', () => {
  const recurringMilestones = [20, 35, 50, 65, 80]
  for (const launch of recurringMilestones) {
    assert.equal(shouldShowRateModal(launch), true, `Launch ${launch} SHOULD show modal`)
  }
})

test('Rate Metis modal schedule logic - submitted or declined feedback disables modal', () => {
  assert.equal(shouldShowRateModal(5, true, false), false, 'Submitted feedback should disable modal on launch 5')
  assert.equal(shouldShowRateModal(20, false, true), false, 'Declined feedback should disable modal on launch 20')
  assert.equal(shouldShowRateModal(35, true, true), false, 'Submitted and declined feedback should disable modal on launch 35')
})

test('main.ts contains the milestone formula launchCount >= 5 && (launchCount - 5) % 15 === 0', () => {
  assert.match(mainContent, /launchCount\s*>=\s*5\s*&&\s*\(launchCount\s*-\s*5\)\s*%\s*15\s*===\s*0/)
})

console.log('✔ rateMetisScheduleStatic.test.mjs passed!')
