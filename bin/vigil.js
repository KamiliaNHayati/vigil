#!/usr/bin/env node
// bin/vigil.js — CLI Tool for Vigil AI Agent Security Harness
//
// Commands:
//   vigil evaluate  — Evaluate a payment intent against all 16 sensor rules
//   vigil reputation — Show trust tier and reputation for an agent
//
// Color coding:
//   GREEN  → APPROVE (LOW risk)
//   YELLOW → APPROVE+WARN (MEDIUM) or WARN (HIGH — requires confirmation)
//   RED    → BLOCK (CRITICAL, hallucination, circuit breaker, etc.)
//
// Exit codes:
//   0 — APPROVE or user confirmed WARN
//   1 — BLOCK or user declined WARN

require('dotenv').config();
const { program } = require('commander');
const chalk = require('chalk');
const readline = require('readline');

// ── Evaluate Command ──────────────────────────────────────────────────────────

program
  .command('evaluate')
  .description('Evaluate a payment intent for risk before executing')
  .requiredOption('--pay-to <address>', 'Recipient wallet address')
  .requiredOption('--amount <tokens>', 'Payment amount in tokens (e.g. 1.5)')
  .requiredOption('--resource <url>', 'Service URL being paid for')
  .requiredOption('--agent <address>', 'Agent wallet address')
  .option('--session <id>', 'Active kpass session ID')
  .option('--vault <address>', 'Agent vault address for budget check')
  .option('--json', 'Output raw JSON instead of formatted display')
  .option('--verbose', 'Show full sensorBreakdown with module statuses')
  .option('--no-confirm', 'Skip interactive WARN confirmation (auto-decline)')
  .action(async (opts) => {
    const { ethers } = require('ethers');

    // Parse amount — accept human-readable tokens, convert to wei
    let amountWei;
    try {
      amountWei = ethers.parseUnits(opts.amount, 18).toString();
    } catch (e) {
      console.error(chalk.red(`✗ Invalid amount: "${opts.amount}" — use decimal tokens (e.g. 1.5)`));
      process.exit(1);
    }

    // Validate addresses
    if (!ethers.isAddress(opts.payTo)) {
      console.error(chalk.red(`✗ Invalid payTo address: ${opts.payTo}`));
      process.exit(1);
    }
    if (!ethers.isAddress(opts.agent)) {
      console.error(chalk.red(`✗ Invalid agent address: ${opts.agent}`));
      process.exit(1);
    }

    // Lazy-load pipeline modules (avoids import cost on --help)
    const sensor   = require('../backend/src/sensor');
    const guide    = require('../backend/src/guide');
    const verifier = require('../backend/src/verifier');
    const policy   = require('../backend/src/policy');

    const intent = {
      payTo: opts.payTo,
      amountWei,
      resource: opts.resource,
      agentAddress: opts.agent,
      sessionId: opts.session,
      vaultAddress: opts.vault
    };

    // ── Run full pipeline ──────────────────────────────────────────────
    const startTime = Date.now();

    // Step 1: Sensor
    const sensorResult = await sensor.check(intent);

    // Step 2: Guide
    const guideResult = await guide.explain({
      amountWei: intent.amountWei,
      payTo: intent.payTo,
      resource: intent.resource,
      sensorResult
    });

    // Step 3: Verifier
    const verificationResult = await verifier.verify(sensorResult, guideResult, {
      amountWei: intent.amountWei,
      payTo: intent.payTo,
      resource: intent.resource
    });
    verificationResult.degraded = guideResult.degraded;
    const finalGuide = verificationResult.guide || guideResult;

    // Step 4: Policy
    const decision = await policy.decide({
      sensorResult,
      verificationResult,
      amountWei: intent.amountWei,
      vaultAddress: intent.vaultAddress
    });

    const elapsed = Date.now() - startTime;

    // Build dynamic sensorBreakdown
    const breakdownMap = {};
    for (const mr of (sensorResult.moduleResults || [])) {
      if (!breakdownMap[mr.category]) breakdownMap[mr.category] = [];
      breakdownMap[mr.category].push({ name: mr.module, status: mr.status, level: mr.level });
    }
    const sensorBreakdown = {
      checks: Object.entries(breakdownMap).map(([category, modules]) => ({ category, modules })),
      totalChecks: (sensorResult.moduleResults || []).length,
      flaggedChecks: (sensorResult.moduleResults || []).filter(m => m.status === 'flagged').length
    };

    const result = {
      action: decision.action,
      code: decision.code,
      sensorLevel: sensorResult.level,
      verifierAligned: verificationResult.aligned,
      verifierAttempts: verificationResult.attempts,
      degraded: guideResult.degraded,
      explanation: finalGuide.explanation,
      primaryConcern: finalGuide.primaryConcern ?? sensorResult.flags[0]?.reason ?? null,
      flags: sensorResult.flags,
      trustTier: sensorResult.trustTier,
      threatIntel: sensorResult.threatIntel ?? null,
      oracleWarning: null,
      pipelineElapsedMs: elapsed,
      sensorBreakdown
    };

    // ── JSON output mode ───────────────────────────────────────────────
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.action === 'BLOCK' ? 1 : 0);
    }

    // ── Formatted output ───────────────────────────────────────────────
    const displayAmount = ethers.formatUnits(amountWei, 18);
    const truncPay = `${opts.payTo.slice(0, 6)}...${opts.payTo.slice(-4)}`;

    console.log('');
    console.log(chalk.bold('═══════════════════════════════════════════════════'));
    console.log(chalk.bold('  🛡  VIGIL — AI Agent Payment Security'));
    console.log(chalk.bold('═══════════════════════════════════════════════════'));
    console.log('');
    console.log(`  ${chalk.dim('Amount:')}    ${chalk.bold(displayAmount)} tokens`);
    console.log(`  ${chalk.dim('Recipient:')} ${truncPay}`);
    console.log(`  ${chalk.dim('Service:')}   ${opts.resource}`);
    console.log(`  ${chalk.dim('Agent:')}     ${opts.agent.slice(0, 6)}...${opts.agent.slice(-4)}`);
    if (opts.session) console.log(`  ${chalk.dim('Session:')}   ${opts.session}`);
    console.log('');

    // Action banner
    if (result.action === 'APPROVE') {
      const banner = result.sensorLevel === 'MEDIUM'
        ? chalk.bgYellow.black.bold(' ⚡ APPROVE + WARNING ')
        : chalk.bgGreen.black.bold(' ✓ APPROVED ');
      console.log(`  ${banner}  ${chalk.dim(`[${result.code}]`)}`);
    } else if (result.action === 'WARN') {
      console.log(`  ${chalk.bgYellow.black.bold(' ⚠  HIGH RISK — CONFIRMATION REQUIRED ')}  ${chalk.dim(`[${result.code}]`)}`);
    } else {
      console.log(`  ${chalk.bgRed.white.bold(' ✗ BLOCKED ')}  ${chalk.dim(`[${result.code}]`)}`);
    }
    console.log('');

    // Sensor level
    const levelColors = {
      LOW: chalk.green,
      MEDIUM: chalk.yellow,
      HIGH: chalk.hex('#FF8C00'),
      CRITICAL: chalk.red
    };
    const colorFn = levelColors[result.sensorLevel] || chalk.white;
    console.log(`  ${chalk.dim('Risk Level:')}  ${colorFn.bold(result.sensorLevel)}`);

    // Flags
    if (result.flags.length > 0) {
      console.log(`  ${chalk.dim('Flags:')}`);
      for (const flag of result.flags) {
        const fc = levelColors[flag.level] || chalk.white;
        console.log(`    ${fc('●')} ${fc(`[${flag.level}]`)} ${flag.reason}`);
      }
    } else {
      console.log(`  ${chalk.dim('Flags:')}      ${chalk.green('None — clean payment')}`);
    }
    console.log('');

    // Explanation
    console.log(`  ${chalk.dim('Analysis:')}`);
    console.log(`    ${result.explanation}`);
    console.log('');

    // Pipeline metadata
    console.log(chalk.dim(`  ── Pipeline ──────────────────────────────────────`));
    console.log(`  ${chalk.dim('Verifier:')}  ${result.verifierAligned ? chalk.green('Aligned') : chalk.red('Misaligned')} (${result.verifierAttempts} attempt${result.verifierAttempts !== 1 ? 's' : ''})`);
    console.log(`  ${chalk.dim('Degraded:')}  ${result.degraded ? chalk.yellow('Yes — LLM unavailable') : chalk.green('No')}`);
    console.log(`  ${chalk.dim('Trust Tier:')} ${result.trustTier}`);
    console.log(`  ${chalk.dim('Elapsed:')}   ${result.pipelineElapsedMs}ms`);
    if (result.threatIntel?.threatsFound) {
      console.log(`  ${chalk.dim('Threat Intel:')} ${chalk.red(result.threatIntel.summary)}`);
    }
    console.log('');

    // ── Verbose: sensorBreakdown ──────────────────────────────────────────
    if (opts.verbose && result.sensorBreakdown) {
      console.log(chalk.dim(`  ── Sensor Breakdown (${result.sensorBreakdown.totalChecks} checks, ${result.sensorBreakdown.flaggedChecks} flagged) ──`));
      for (const cat of result.sensorBreakdown.checks) {
        console.log(`  ${chalk.bold(cat.category)}`);
        for (const mod of cat.modules) {
          const statusIcon = mod.status === 'flagged' ? chalk.red('✗') :
                             mod.status === 'clean' ? chalk.green('✓') :
                             mod.status === 'skipped' ? chalk.gray('─') :
                             chalk.yellow('!');
          const levelStr = mod.level ? chalk.dim(` [${mod.level}]`) : '';
          console.log(`    ${statusIcon} ${mod.name}${levelStr}`);
        }
      }
      console.log('');
    }

    // ── Interactive WARN flow ──────────────────────────────────────────
    if (result.action === 'WARN') {
      if (opts.confirm === false) {
        // --no-confirm flag: auto-decline
        console.log(chalk.red('  Aborted (--no-confirm flag set).'));
        process.exit(1);
      }

      const rl = readline.createInterface({
        input: process.stdin, output: process.stdout
      });
      console.log(chalk.yellow(`  ⚠  HIGH risk detected: ${result.explanation}`));
      console.log(chalk.yellow(`     Flags: ${result.flags.map(f => f.reason).join(' · ')}`));
      console.log('');
      const answer = await new Promise(resolve =>
        rl.question(chalk.bold('  Proceed anyway? (yes/no): '), resolve)
      );
      rl.close();
      if (answer.toLowerCase() !== 'yes') {
        console.log(chalk.red('\n  Aborted by user.'));
        process.exit(1);
      }
      console.log(chalk.green('\n  ✓ User confirmed — proceeding.'));
      process.exit(0);
    }

    // Exit codes: BLOCK → 1, APPROVE → 0
    process.exit(result.action === 'BLOCK' ? 1 : 0);
  });

// ── Reputation Command ────────────────────────────────────────────────────────

program
  .command('reputation')
  .description('Show trust tier and reputation for an agent')
  .requiredOption('--agent <address>', 'Agent wallet address')
  .option('--json', 'Output raw JSON')
  .action(async (opts) => {
    const { ethers } = require('ethers');
    if (!ethers.isAddress(opts.agent)) {
      console.error(chalk.red(`✗ Invalid agent address: ${opts.agent}`));
      process.exit(1);
    }

    const { handleGetReputation } = require('../backend/src/mcp-server');
    const result = await handleGetReputation({ agentAddress: opts.agent });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }

    const tierNames = ['🆕 New', '📊 Established', '✅ Trusted', '🏆 Verified'];
    const tierColors = [chalk.gray, chalk.white, chalk.green, chalk.cyan];
    const tierColor = tierColors[result.trustTier] || chalk.white;

    console.log('');
    console.log(chalk.bold('═══════════════════════════════════════════════════'));
    console.log(chalk.bold('  🛡  VIGIL — Agent Reputation'));
    console.log(chalk.bold('═══════════════════════════════════════════════════'));
    console.log('');
    console.log(`  ${chalk.dim('Agent:')}        ${opts.agent.slice(0, 6)}...${opts.agent.slice(-4)}`);
    console.log(`  ${chalk.dim('Trust Tier:')}   ${tierColor(tierNames[result.trustTier] || `Tier ${result.trustTier}`)}`);
    console.log(`  ${chalk.dim('Score:')}        ${result.reputationScore} / 10,000`);
    console.log(`  ${chalk.dim('Total:')}        ${result.totalActions} actions`);
    console.log(`  ${chalk.dim('Successful:')}   ${chalk.green(result.successfulActions)}`);
    console.log(`  ${chalk.dim('Failed:')}       ${chalk.red(result.failedActions)}`);
    console.log(`  ${chalk.dim('Source:')}       ${result.source}`);
    console.log('');

    process.exit(0);
  });

// ── Seed Command (convenience alias) ──────────────────────────────────────────

program
  .command('seed')
  .description('Seed demo data for behavioral drift baseline')
  .action(() => {
    require('../scripts/seed-demo-data.js');
  });

// ── Parse ─────────────────────────────────────────────────────────────────────

program
  .name('vigil')
  .version('1.0.0')
  .description('🛡 Vigil — AI Agent Payment Security for Kite Agent Passport')
  .parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
