/**
 * Pomodoro Timer with ARIA Notify API support
 *
 * Uses Element.ariaNotify() (Chrome 141+) for screen reader notifications.
 * Falls back to a hidden aria-live region for unsupported browsers.
 */

import { Temporal } from "@js-temporal/polyfill";

// --------------------------------------------------------
// Type augmentation for ariaNotify (not yet in lib.dom.d.ts)
// --------------------------------------------------------
interface AriaNotificationOptions {
	priority?: "normal" | "high";
}

declare global {
	interface Element {
		ariaNotify?(announcement: string, options?: AriaNotificationOptions): void;
	}
	interface Document {
		ariaNotify?(announcement: string, options?: AriaNotificationOptions): void;
	}
}

// --------------------------------------------------------
// State
// --------------------------------------------------------
type TimerState = "idle" | "running" | "paused";

let totalSeconds = 25 * 60;
let remainingSeconds = totalSeconds;
let timerState: TimerState = "idle";
let intervalId: ReturnType<typeof setInterval> | null = null;
let supportsAriaNotify = false;

// Notification thresholds in seconds
const NOTIFICATION_THRESHOLDS = [5 * 60, 60, 30, 10] as const;
const notifiedThresholds = new Set<number>();

// --------------------------------------------------------
// DOM references
// --------------------------------------------------------
function getEl<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`Element #${id} not found`);
	return el as T;
}

// --------------------------------------------------------
// Notification helpers
// --------------------------------------------------------

function notify(message: string, priority: "normal" | "high" = "normal"): void {
	if (supportsAriaNotify && document.ariaNotify) {
		document.ariaNotify(message, { priority });
	} else {
		// Fallback: write to hidden aria-live region
		const fallback = getEl("sr-fallback");
		fallback.textContent = "";
		// Force reflow so the AT picks up the change
		void fallback.offsetHeight;
		fallback.textContent = message;
	}

	addLogEntry(message, priority);
}

function addLogEntry(message: string, priority: "normal" | "high"): void {
	const log = getEl<HTMLUListElement>("notification-log");
	const li = document.createElement("li");
	const now = Temporal.Now.plainTimeISO();
	const time = now.toString({ smallestUnit: "second" });

	const badge =
		priority === "high"
			? '<span class="inline-block px-1.5 py-0.5 text-xs rounded bg-rose-100 text-rose-700 font-medium">high</span>'
			: '<span class="inline-block px-1.5 py-0.5 text-xs rounded bg-stone-100 text-stone-600 font-medium">normal</span>';

	li.innerHTML = `<span class="text-stone-400">${time}</span> ${badge} ${message}`;
	log.prepend(li);
}

// --------------------------------------------------------
// Timer display
// --------------------------------------------------------

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateDisplay(): void {
	const output = getEl("timer-output");
	output.textContent = formatTime(remainingSeconds);

	// Update progress bar
	const elapsed = totalSeconds - remainingSeconds;
	const percent = totalSeconds > 0 ? (elapsed / totalSeconds) * 100 : 0;
	const progressBar = getEl("progress-bar");
	const progressFill = getEl("progress-fill");
	progressBar.setAttribute("aria-valuenow", String(Math.round(percent)));
	progressFill.style.width = `${percent}%`;
}

function updatePhase(text: string): void {
	getEl("timer-phase").textContent = text;
}

// --------------------------------------------------------
// Timer controls
// --------------------------------------------------------

function setDuration(minutes: number): void {
	if (timerState === "running") return;

	totalSeconds = minutes * 60;
	remainingSeconds = totalSeconds;
	timerState = "idle";
	notifiedThresholds.clear();
	updateDisplay();
	updatePhase("準備完了");
	updateStartButton();
	notify(`タイマーを${minutes}分に設定しました`);
}

function startTimer(): void {
	if (timerState === "running") return;

	timerState = "running";
	updatePhase("実行中");
	updateStartButton();

	if (remainingSeconds === totalSeconds) {
		const minutes = Math.round(totalSeconds / 60);
		notify(`${minutes}分のタイマーを開始します`);
	} else {
		notify("タイマーを再開します");
	}

	intervalId = setInterval(() => {
		remainingSeconds--;
		updateDisplay();
		checkThresholds();

		if (remainingSeconds <= 0) {
			completeTimer();
		}
	}, 1000);
}

function pauseTimer(): void {
	if (timerState !== "running") return;

	timerState = "paused";
	if (intervalId !== null) {
		clearInterval(intervalId);
		intervalId = null;
	}
	updatePhase("一時停止中");
	updateStartButton();
	notify("タイマーを一時停止しました");
}

function resetTimer(): void {
	if (intervalId !== null) {
		clearInterval(intervalId);
		intervalId = null;
	}
	timerState = "idle";
	remainingSeconds = totalSeconds;
	notifiedThresholds.clear();
	updateDisplay();
	updatePhase("準備完了");
	updateStartButton();
	notify("タイマーをリセットしました");
}

function completeTimer(): void {
	if (intervalId !== null) {
		clearInterval(intervalId);
		intervalId = null;
	}
	timerState = "idle";
	remainingSeconds = 0;
	updateDisplay();
	updatePhase("完了!");
	updateStartButton();
	notify("タイマーが完了しました！お疲れさまです", "high");
}

function checkThresholds(): void {
	for (const threshold of NOTIFICATION_THRESHOLDS) {
		if (
			remainingSeconds === threshold &&
			!notifiedThresholds.has(threshold) &&
			threshold < totalSeconds
		) {
			notifiedThresholds.add(threshold);

			const label = formatThresholdLabel(threshold);
			const priority = threshold <= 30 ? "high" : "normal";
			notify(`残り${label}です`, priority);
		}
	}
}

function formatThresholdLabel(seconds: number): string {
	if (seconds >= 60) {
		return `${seconds / 60}分`;
	}
	return `${seconds}秒`;
}

// --------------------------------------------------------
// Start/Pause button state
// --------------------------------------------------------

function updateStartButton(): void {
	const btn = getEl("start-btn");

	switch (timerState) {
		case "idle":
			btn.textContent = "スタート";
			btn.className = btn.className
				.replace(/bg-amber-\d+/g, "")
				.replace(/hover:bg-amber-\d+/g, "")
				.replace(/outline-amber-\d+/g, "")
				.replace(/bg-emerald-\d+/g, "")
				.replace(/hover:bg-emerald-\d+/g, "")
				.replace(/outline-emerald-\d+/g, "");
			btn.classList.add(
				"bg-emerald-600",
				"hover:bg-emerald-700",
				"outline-emerald-600",
			);
			break;
		case "running":
			btn.textContent = "一時停止";
			btn.className = btn.className
				.replace(/bg-emerald-\d+/g, "")
				.replace(/hover:bg-emerald-\d+/g, "")
				.replace(/outline-emerald-\d+/g, "")
				.replace(/bg-amber-\d+/g, "")
				.replace(/hover:bg-amber-\d+/g, "")
				.replace(/outline-amber-\d+/g, "");
			btn.classList.add(
				"bg-amber-500",
				"hover:bg-amber-600",
				"outline-amber-500",
			);
			break;
		case "paused":
			btn.textContent = "再開";
			btn.className = btn.className
				.replace(/bg-amber-\d+/g, "")
				.replace(/hover:bg-amber-\d+/g, "")
				.replace(/outline-amber-\d+/g, "")
				.replace(/bg-emerald-\d+/g, "")
				.replace(/hover:bg-emerald-\d+/g, "")
				.replace(/outline-emerald-\d+/g, "");
			btn.classList.add(
				"bg-emerald-600",
				"hover:bg-emerald-700",
				"outline-emerald-600",
			);
			break;
	}
}

// --------------------------------------------------------
// Preset button styling
// --------------------------------------------------------

function updatePresetButtons(activeMinutes: number): void {
	const buttons = document.querySelectorAll<HTMLButtonElement>(".preset-btn");
	for (const btn of buttons) {
		const minutes = Number(btn.dataset.minutes);
		const isActive = minutes === activeMinutes;
		btn.setAttribute("aria-pressed", String(isActive));

		if (isActive) {
			btn.classList.remove("bg-stone-200", "text-stone-700");
			btn.classList.add("bg-rose-500", "text-white");
		} else {
			btn.classList.remove("bg-rose-500", "text-white");
			btn.classList.add("bg-stone-200", "text-stone-700");
		}
	}
}

// --------------------------------------------------------
// Init
// --------------------------------------------------------

export function initTimer(): void {
	// Feature detection
	supportsAriaNotify =
		typeof document.ariaNotify === "function" ||
		typeof Element.prototype.ariaNotify === "function";

	const banner = getEl("api-support-banner");
	if (supportsAriaNotify) {
		banner.textContent =
			"ariaNotify() がサポートされています。通知はネイティブAPIで送信されます。";
		banner.classList.remove("hidden");
		banner.classList.add(
			"bg-emerald-50",
			"text-emerald-800",
			"border",
			"border-emerald-200",
		);
	} else {
		banner.textContent =
			"ariaNotify() は未サポートです。aria-live regionにフォールバックします。";
		banner.classList.remove("hidden");
		banner.classList.add(
			"bg-amber-50",
			"text-amber-800",
			"border",
			"border-amber-200",
		);
	}

	// Preset buttons
	const presetButtons =
		document.querySelectorAll<HTMLButtonElement>(".preset-btn");
	for (const btn of presetButtons) {
		btn.addEventListener("click", () => {
			const minutes = Number(btn.dataset.minutes);
			if (Number.isNaN(minutes) || minutes <= 0) return;
			setDuration(minutes);
			updatePresetButtons(minutes);
		});
	}

	// Custom time
	const customInput = getEl<HTMLInputElement>("custom-minutes");
	const setCustomBtn = getEl("set-custom-btn");

	function applyCustomTime(): void {
		const val = Number(customInput.value);
		if (Number.isNaN(val) || val < 1 || val > 120) {
			notify("1〜120の範囲で入力してください", "high");
			customInput.focus();
			return;
		}
		setDuration(val);
		// Deselect presets
		updatePresetButtons(-1);
	}

	setCustomBtn.addEventListener("click", applyCustomTime);
	customInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			applyCustomTime();
		}
	});

	// Start / Pause
	getEl("start-btn").addEventListener("click", () => {
		if (timerState === "running") {
			pauseTimer();
		} else {
			if (timerState === "idle" && remainingSeconds === 0) {
				remainingSeconds = totalSeconds;
				notifiedThresholds.clear();
				updateDisplay();
			}
			startTimer();
		}
	});

	// Reset
	getEl("reset-btn").addEventListener("click", resetTimer);

	// Keyboard shortcut: Space to start/pause when not focused on input
	document.addEventListener("keydown", (e) => {
		if (
			e.key === " " &&
			document.activeElement?.tagName !== "INPUT" &&
			document.activeElement?.tagName !== "BUTTON"
		) {
			e.preventDefault();
			if (timerState === "running") {
				pauseTimer();
			} else {
				startTimer();
			}
		}
	});

	// Debug: aria-live toggle
	const ariaLiveToggles =
		document.querySelectorAll<HTMLButtonElement>(".aria-live-toggle");
	const timerOutput = getEl("timer-output");
	const currentLabel = getEl("current-aria-live");

	for (const btn of ariaLiveToggles) {
		btn.addEventListener("click", () => {
			const value = btn.dataset.liveValue ?? "off";
			timerOutput.setAttribute("aria-live", value);
			currentLabel.textContent = `aria-live="${value}"`;

			// Update toggle button styles
			for (const b of ariaLiveToggles) {
				const isActive = b === btn;
				b.setAttribute("aria-pressed", String(isActive));
				if (isActive) {
					b.classList.remove("bg-amber-200", "text-amber-800");
					b.classList.add("bg-amber-800", "text-white");
				} else {
					b.classList.remove("bg-amber-800", "text-white");
					b.classList.add("bg-amber-200", "text-amber-800");
				}
			}
		});
	}

	// Initialize display
	updateDisplay();
}
