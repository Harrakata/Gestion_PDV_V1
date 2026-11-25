import { test, expect } from '@playwright/test';
import { ASSISTANT_GUIDES } from '../supabase/functions/_shared/assistantKnowledge.js';

const fixture = '/tests/fixtures/operational-assistant.html';
async function open(page) {
  await page.getByRole('button', { name: 'Ouvrir l’assistant', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // Le panneau reçoit le focus, jamais la saisie (clavier du téléphone).
  await expect(page.getByRole('dialog')).toBeFocused();
}
async function ask(page, question = 'État du terminal TERM01 ?') {
  await page.getByLabel('Votre question').fill(question);
  await page.getByRole('button', { name: 'Envoyer la question' }).click();
}

test('guest guide answers rules without requesting data and restores focus on closing', async ({ page }) => {
  await page.goto(`${fixture}?guest`);
  await open(page);
  await ask(page, 'Comment fonctionne le rapprochement salaire caisse ?');
  await expect(page.getByRole('log')).toContainText('Écart = versé - à verser');
  await expect(page.getByRole('log')).toContainText('Guide intégré');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ouvrir l’assistant' })).toBeFocused();
});

test('opening and returning home show suggestions from the top, without focusing the composer', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto(`${fixture}?guest`);
  await open(page);
  const log = page.getByRole('log');
  await expect(page.getByLabel('Votre question')).not.toBeFocused();
  expect(await log.evaluate(el => el.scrollTop)).toBe(0);
  await ask(page, 'Comment fonctionne le rapprochement salaire caisse ?');
  await page.getByRole('button', { name: 'Accueil' }).click();
  await expect(page.getByRole('dialog')).toBeFocused();
  expect(await log.evaluate(el => el.scrollTop)).toBe(0);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement!.closest('[role="dialog"]') !== null)).toBe(true);
});

test('AI response exposes dated internal sources only', async ({ page }) => {
  await page.goto(fixture);
  await open(page);
  await expect(page.getByText('IA · Consultation en lecture seule', { exact: true })).toBeVisible();
  await ask(page);
  await expect(page.getByRole('log')).toContainText('TERM01 est Actif');
  await expect(page.getByRole('log')).toContainText('Consulté le');
  await expect(page.getByRole('button', { name: 'Lien non autorisé' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Terminaux et suivi maintenance' }).click();
  await expect(page.getByLabel('Destination')).toHaveText('/espace-exploitation/maintenance-terminaux');
});

test('cancelling a request ignores late responses', async ({ page }) => {
  await page.goto(`${fixture}?slow`);
  await open(page);
  await ask(page);
  await page.getByRole('button', { name: 'Arrêter la réponse' }).click();
  await expect(page.getByText('Recherche en cours…')).toHaveCount(0);
  await expect(page.getByRole('log')).not.toContainText('TERM01 est Actif');
  await expect(page.getByRole('button', { name: 'Arrêter la réponse' })).toHaveCount(0);
});

test('server failures use a clearly labelled guide and denied access clears conversation', async ({ page }) => {
  await page.goto(`${fixture}?error`);
  await open(page);
  await ask(page, 'Comment utiliser la maintenance ?');
  await expect(page.getByRole('log')).toContainText('Guide intégré');
  await expect(page.getByRole('log')).not.toContainText('Service de test indisponible.');
  await page.goto(`${fixture}?denied`);
  await open(page);
  await ask(page);
  await expect(page.getByText('Guide intégré · Données locales')).toBeVisible();
  await expect(page.getByRole('log')).not.toContainText('État du terminal');
});

test('new conversation and account changes remove previous responses', async ({ page }) => {
  await page.goto(fixture);
  await open(page);
  await ask(page);
  await expect(page.getByRole('log')).toContainText('TERM01 est Actif');
  await page.getByRole('button', { name: 'Accueil' }).click();
  await expect(page.getByRole('log')).not.toContainText('TERM01 est Actif');
  await ask(page);
  await expect(page.getByRole('log')).toContainText('TERM01 est Actif');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Changer de compte' }).click();
  await open(page);
  await expect(page.getByRole('log')).not.toContainText('TERM01 est Actif');
});

test('offline mode remains usable as a guide', async ({ page, context }) => {
  await page.goto(fixture);
  await open(page);
  await context.setOffline(true);
  await expect(page.getByText('Guide intégré · Données locales')).toBeVisible();
  await ask(page, 'Que signifie maintenance préventive ?');
  await expect(page.getByRole('log')).toContainText('Guide intégré');
  await context.setOffline(false);
});

test('practical library searches, filters, opens steps and resets empty results', async ({ page }) => {
  await page.goto(`${fixture}?guest`);
  await open(page);
  await page.getByRole('tab', { name: 'Fiches pratiques' }).click();
  await expect(page.getByText(`${ASSISTANT_GUIDES.length} fiche(s)`, { exact: true })).toBeVisible();
  await page.getByLabel('Thème des fiches').selectOption('reseau');
  await page.getByLabel('Rechercher une fiche').fill('créer agence');
  await page.getByRole('button', { name: 'Créer ou modifier une agence', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Créer ou modifier une agence' })).toBeFocused();
  await expect(page.getByRole('listitem').filter({ hasText: 'code PDV' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Ouvrir Agences' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Toutes les fiches', exact: true }).click();
  await expect(page.getByLabel('Rechercher une fiche')).toHaveValue('créer agence');
  await page.getByLabel('Rechercher une fiche').fill('zzzzzzzz');
  await expect(page.getByText('Aucune fiche ne correspond à ces critères.')).toBeVisible();
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
  await expect(page.getByText(`${ASSISTANT_GUIDES.length} fiche(s)`, { exact: true })).toBeVisible();
});

test('reading a practical guide never calls AI, even when AI mode is active', async ({ page }) => {
  await page.goto(`${fixture}?error`);
  await open(page);
  await page.getByRole('button', { name: 'États des terminaux', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Guide intégré');
  await expect(page.getByRole('log')).toContainText('Le statut enregistré');
  await expect(page.getByText('Service de test indisponible.', { exact: false })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Fiches pratiques' }).click();
  await page.getByRole('button', { name: 'Maintenance préventive et curative', exact: false }).click();
  await expect(page.getByRole('button', { name: 'Ouvrir Maintenance Terminaux' })).toBeVisible();
  await page.getByRole('button', { name: 'Reprendre dans la conversation' }).click();
  await expect(page.getByRole('tab', { name: 'Conversation' })).toHaveAttribute('data-state', 'active');
  await expect(page.getByRole('log')).toContainText('La maintenance préventive');
  await expect(page.getByText('Service de test indisponible.', { exact: false })).toHaveCount(0);
});

test('practical library remains readable on small mobile and desktop offline', async ({ page, context }, testInfo) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 568 }]) {
    await context.setOffline(false);
    await page.setViewportSize(viewport);
    await page.goto(`${fixture}?guest`);
    await open(page);
    await context.setOffline(true);
    await page.getByRole('tab', { name: 'Fiches pratiques' }).click();
    await expect(page.getByLabel('Rechercher une fiche')).toBeInViewport();
    await page.getByLabel('Rechercher une fiche').fill('import CSV');
    await page.getByRole('button', { name: 'Import et export CSV', exact: false }).click();
    await expect(page.getByRole('heading', { name: 'Import et export CSV' })).toBeVisible();
    const dialog = page.getByRole('dialog');
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: testInfo.outputPath(`guides-${viewport.width}.png`) });
  }
});

test('panel and composer fit desktop and mobile, including long content', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${fixture}?guest`);
    await open(page);
    await ask(page, 'maintenance'.repeat(100));
    const dialog = page.getByRole('dialog');
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.getByLabel('Votre question')).toBeInViewport();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`assistant-${viewport.width}.png`) });
  }
});
