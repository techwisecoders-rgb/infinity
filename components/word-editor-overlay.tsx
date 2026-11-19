"use client";

import { useEffect, useRef, useState } from "react";
import "@/app/word-editor.css";

declare global {
  interface Window {
    openWordEditorForTarget?: (target: HTMLElement) => void;
    closeWordEditor?: () => void;
    submitNewSocialPost?: () => void;
  }
}

export default function WordEditorOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [highlightColor, setHighlightColor] = useState("#ffff00");
  const [fontColor, setFontColor] = useState("#ff0000");
  const [pageBg, setPageBg] = useState("#ffffff");

  const appRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const effectsMenuRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);

  // Lock .app bounds to visualViewport when open
  useEffect(() => {
    if (!isOpen) return;
    const vv = window.visualViewport;
    if (!vv) return;

    function updateAppBounds() {
      const app = appRef.current;
      if (!app || !window.visualViewport) return;
      app.style.height = `${window.visualViewport.height}px`;
      app.style.top = `${window.visualViewport.offsetTop}px`;
    }

    vv.addEventListener("resize", updateAppBounds);
    vv.addEventListener("scroll", updateAppBounds);
    updateAppBounds();

    return () => {
      vv.removeEventListener("resize", updateAppBounds);
      vv.removeEventListener("scroll", updateAppBounds);
    };
  }, [isOpen]);

  // Track text selection inside #page
  useEffect(() => {
    function handleSelectionChange() {
      const page = pageRef.current;
      if (!page) return;
      const selection = window.getSelection();
      if (
        selection &&
        selection.rangeCount > 0 &&
        !selection.isCollapsed &&
        page.contains(selection.anchorNode) &&
        page.contains(selection.focusNode)
      ) {
        savedRangeRef.current = selection.getRangeAt(0).cloneRange();
      }
    }

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  // Close effects menu when clicking outside
  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      const menu = effectsMenuRef.current;
      if (menu && !menu.contains(e.target as Node)) {
        setEffectsOpen(false);
      }
    }
    document.addEventListener("click", handleDocClick);
    return () => document.removeEventListener("click", handleDocClick);
  }, []);

  // Open Word editor when clicking any textarea or editable post caption
  useEffect(() => {
    function openForTarget(target: HTMLElement) {
      activeTargetRef.current = target;
      const page = pageRef.current;
      if (page) {
        if (target instanceof HTMLTextAreaElement) {
          const richHtml = target.dataset.richHtml;
          page.innerHTML = richHtml || target.value.replace(/\n/g, "<br>");
          const bg = target.dataset.richBg || "#ffffff";
          page.style.backgroundColor = bg;
          setPageBg(bg);
        } else {
          page.innerHTML = target.innerHTML;
          page.style.backgroundColor = "#ffffff";
          setPageBg("#ffffff");
        }
      }
      savedRangeRef.current = null;
      setEffectsOpen(false);
      setIsOpen(true);
      requestAnimationFrame(() => {
        pageRef.current?.focus();
      });
    }

    window.openWordEditorForTarget = openForTarget;
    window.closeWordEditor = () => {
      setIsOpen(false);
      setEffectsOpen(false);
      activeTargetRef.current = null;
    };

    function handleGlobalClick(e: MouseEvent) {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (target.closest("#wordEditorOverlay")) return;

      const editableTarget = target.closest(
        'textarea, .profile-feed-caption[contenteditable="true"]'
      ) as HTMLElement | null;

      if (!editableTarget) return;

      e.preventDefault();
      e.stopPropagation();
      openForTarget(editableTarget);
    }

    document.addEventListener("click", handleGlobalClick, true);
    return () => {
      document.removeEventListener("click", handleGlobalClick, true);
      delete window.openWordEditorForTarget;
      delete window.closeWordEditor;
    };
  }, []);

  function restoreSelection() {
    const page = pageRef.current;
    if (!page) return;
    page.focus();
    if (savedRangeRef.current) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(savedRangeRef.current);
      }
    }
  }

  function format(command: string) {
    restoreSelection();
    document.execCommand(command, false, undefined);
  }

  function applyFont(font: string) {
    restoreSelection();
    document.execCommand("fontName", false, font);
  }

  function applyInlineStyle(property: string, value: string) {
    restoreSelection();
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) {
      alert("Please select text first.");
      return;
    }
    const range = selection.getRangeAt(0);
    const span = document.createElement("span");
    (span.style as unknown as Record<string, string>)[property] = value;
    try {
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    } catch (error) {
      console.log(error);
    }
  }

  function applyFontSize(size: string) {
    applyInlineStyle("fontSize", `${size}px`);
  }

  function setLetterSpacing(value: string) {
    applyInlineStyle("letterSpacing", value);
  }

  function updateColorTool(type: "highlight" | "color", color: string) {
    if (type === "color") {
      applyInlineStyle("color", color);
      setFontColor(color);
    } else {
      applyInlineStyle("backgroundColor", color);
      setHighlightColor(color);
    }
  }

  function applyTextPreset(className: string) {
    restoreSelection();
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) {
      alert("Please select text first.");
      return;
    }
    const range = selection.getRangeAt(0);
    const span = document.createElement("span");
    span.className = className;
    span.style.display = "inline-block";
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    } catch (err) {
      console.log(err);
    }
    setEffectsOpen(false);
  }

  function applyCustomEffect(type: string) {
    switch (type) {
      case "outline":
        applyInlineStyle("webkitTextStroke", "1px #2b579a");
        applyInlineStyle("color", "#ffffff");
        break;
      case "shadow":
        applyInlineStyle("textShadow", "2px 2px 4px rgba(0, 0, 0, 0.45)");
        break;
      case "reflection":
        applyInlineStyle("display", "inline-block");
        applyInlineStyle(
          "webkitBoxReflect",
          "below -4px linear-gradient(transparent, rgba(0,0,0,0.35))"
        );
        break;
      case "glow":
        applyInlineStyle("textShadow", "0 0 8px #4472c4, 0 0 12px #8faadc");
        break;
      case "numberStyles":
        applyInlineStyle("fontVariantNumeric", "oldstyle-nums proportional-nums");
        break;
      case "ligatures":
        applyInlineStyle("fontVariantLigatures", "common-ligatures discretionary-ligatures");
        break;
      case "stylisticSets":
        applyInlineStyle("fontFeatureSettings", '"ss01" 1, "salt" 1');
        break;
    }
    setEffectsOpen(false);
  }

  function changeCase(type: string) {
    if (type === "normal") return;
    restoreSelection();
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) {
      alert("Please select text first.");
      return;
    }
    const text = selection.toString();
    let result = text;
    if (type === "upper") result = text.toUpperCase();
    else if (type === "lower") result = text.toLowerCase();
    else if (type === "title") {
      result = text.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(result);
    range.insertNode(node);
    const newRange = document.createRange();
    newRange.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(newRange);
    savedRangeRef.current = newRange.cloneRange();
  }

  function changeListStyle(style: string) {
    if (!style) return;
    restoreSelection();
    const page = pageRef.current;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !page) return;
    let node: Node | null = selection.anchorNode;
    if (node && node.nodeType !== 1) node = node.parentElement;
    let list = node as HTMLElement | null;
    while (list && list !== page && !["UL", "OL"].includes(list.tagName)) {
      list = list.parentElement;
    }
    const isBullet = ["disc", "circle", "square"].includes(style);
    const targetTag = isBullet ? "UL" : "OL";
    if (!list || list === page || list.tagName !== targetTag) {
      document.execCommand(isBullet ? "insertUnorderedList" : "insertOrderedList", false, undefined);
      node = window.getSelection()?.anchorNode ?? null;
      if (node && node.nodeType !== 1) node = node.parentElement;
      list = node as HTMLElement | null;
      while (list && list !== page && list.tagName !== targetTag) {
        list = list.parentElement;
      }
    }
    if (list && list !== page) {
      if (isBullet) list.style.listStyleType = style;
      else list.setAttribute("type", style);
    }
  }

  function setLineSpacing(value: string) {
    restoreSelection();
    const page = pageRef.current;
    const selection = window.getSelection();
    if (!selection || !page) return;
    let node: Node | null = selection.anchorNode;
    if (!node) return;
    if (node.nodeType !== 1) node = node.parentElement;
    let block = node as HTMLElement | null;
    while (block && block !== page && !["P", "DIV", "LI", "H1", "H2", "H3"].includes(block.tagName)) {
      block = block.parentElement;
    }
    if (block && block !== page) block.style.lineHeight = value;
    else page.style.lineHeight = value;
  }

  function handleClose() {
    setIsOpen(false);
    setEffectsOpen(false);
    activeTargetRef.current = null;
  }

  function handleSend() {
    const page = pageRef.current;
    const target = activeTargetRef.current;
    if (!page) return;

    const plainText = page.innerText.trim();
    const htmlContent = page.innerHTML.trim();

    if (!plainText && !htmlContent) {
      page.focus();
      return;
    }

    if (target instanceof HTMLTextAreaElement) {
      target.value = plainText;
      target.dataset.richHtml = htmlContent;
      target.dataset.richBg = pageBg;
      setIsOpen(false);
      setEffectsOpen(false);
      activeTargetRef.current = null;

      // If this is the Create New Post textarea, publish it immediately as a post
      if (target.id === "newPostText" && typeof window.submitNewSocialPost === "function") {
        window.submitNewSocialPost();
      }
      return;
    }

    if (target && target.isContentEditable) {
      target.innerHTML = htmlContent;
      if (pageBg && pageBg.toLowerCase() !== "#ffffff") {
        target.style.backgroundColor = pageBg;
        target.style.padding = "10px";
        target.style.color = "#111";
      }
      setIsOpen(false);
      setEffectsOpen(false);
      activeTargetRef.current = null;
      return;
    }

    // Fallback: populate #newPostText and publish as a post
    const postTextarea = document.getElementById("newPostText") as HTMLTextAreaElement | null;
    if (postTextarea) {
      postTextarea.value = plainText;
      postTextarea.dataset.richHtml = htmlContent;
      postTextarea.dataset.richBg = pageBg;
      setIsOpen(false);
      setEffectsOpen(false);
      activeTargetRef.current = null;
      if (typeof window.submitNewSocialPost === "function") {
        window.submitNewSocialPost();
      }
    }
  }

  function preventFocusLoss(e: React.MouseEvent) {
    e.preventDefault();
  }

  return (
    <div id="wordEditorOverlay" style={{ display: isOpen ? "block" : "none" }}>
      <div className="app" ref={appRef}>
        <div className="toolbar">
          {/* LINE 1 */}
          <div className="tool-row">
            <select
              className="font-select"
              id="fontFamily"
              defaultValue="Arial"
              onChange={(e) => applyFont(e.target.value)}
            >
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Georgia">Georgia</option>
              <option value="Verdana">Verdana</option>
              <option value="Tahoma">Tahoma</option>
              <option value="Courier New">Courier New</option>
              <option value="Trebuchet MS">Trebuchet MS</option>
              <option value="Impact">Impact</option>
            </select>

            <select
              className="size-select"
              id="fontSize"
              defaultValue="16"
              onChange={(e) => applyFontSize(e.target.value)}
            >
              <option value="10">10</option>
              <option value="12">12</option>
              <option value="14">14</option>
              <option value="16">16</option>
              <option value="18">18</option>
              <option value="20">20</option>
              <option value="24">24</option>
              <option value="28">28</option>
              <option value="32">32</option>
              <option value="36">36</option>
              <option value="48">48</option>
              <option value="72">72</option>
            </select>

            <select
              className="font-select"
              id="textCase"
              onChange={(e) => {
                changeCase(e.target.value);
                e.target.selectedIndex = 0;
              }}
            >
              <option value="normal">CASE</option>
              <option value="upper">UPPERCASE</option>
              <option value="lower">lowercase</option>
              <option value="title">Title Case</option>
            </select>

            <button
              type="button"
              className="effects-btn"
              onMouseDown={preventFocusLoss}
              onClick={(e) => {
                e.stopPropagation();
                setEffectsOpen((prev) => !prev);
              }}
              title="Text Effects"
            >
              <svg viewBox="0 0 36 24" fill="none">
                <path
                  d="M8 18L13 5L18 18M9.8 14H16.2"
                  stroke="#4472c4"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 18L13 5L18 18M9.8 14H16.2"
                  stroke="#ffffff"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M26 10.5L29 13.5L32 10.5"
                  stroke="#333"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <div className="color-tool-wrapper" title="Highlight">
              <svg viewBox="0 0 36 24" fill="none">
                <path
                  d="M14.5 4.5C15.6 3.4 17.4 3.4 18.5 4.5C19.6 5.6 19.6 7.4 18.5 8.5L11.5 15.5L7.5 11.5L14.5 4.5Z"
                  fill="#ffffff"
                  stroke="#333"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M7.5 11.5L11.5 15.5L8.5 17H4.5L7.5 11.5Z"
                  fill="#333"
                  stroke="#333"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <rect id="highlightBar" x="4" y="19" width="16" height="3.5" rx="0.5" fill={highlightColor} />
                <path
                  d="M26.5 10.5L29.5 13.5L32.5 10.5"
                  stroke="#333"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <input
                type="color"
                value={highlightColor}
                onChange={(e) => updateColorTool("highlight", e.target.value)}
              />
            </div>

            <div className="color-tool-wrapper" title="Font Color">
              <svg viewBox="0 0 36 24" fill="none">
                <path
                  d="M7.5 16.5L12 4.5L16.5 16.5M9 13H15"
                  stroke="#333"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect id="fontColorBar" x="5" y="19" width="14" height="3.5" rx="0.5" fill={fontColor} />
                <path
                  d="M26.5 10.5L29.5 13.5L32.5 10.5"
                  stroke="#333"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <input
                type="color"
                value={fontColor}
                onChange={(e) => updateColorTool("color", e.target.value)}
              />
            </div>

            <select
              id="listStyle"
              style={{ width: "65px" }}
              onChange={(e) => {
                changeListStyle(e.target.value);
                e.target.selectedIndex = 0;
              }}
            >
              <option value="">List</option>
              <option value="1">1, 2, 3</option>
              <option value="A">A, B, C</option>
              <option value="a">a, b, c</option>
              <option value="I">I, II, III</option>
              <option value="i">i, ii, iii</option>
              <option value="disc">● Dots</option>
              <option value="circle">○ Circles</option>
              <option value="square">■ Squares</option>
            </select>
          </div>

          {/* LINE 2 */}
          <div className="tool-row">
            <button type="button" className="tool-btn" onMouseDown={preventFocusLoss} onClick={() => format("bold")}>
              <b>B</b>
            </button>
            <button type="button" className="tool-btn" onMouseDown={preventFocusLoss} onClick={() => format("italic")}>
              <i>I</i>
            </button>
            <button type="button" className="tool-btn" onMouseDown={preventFocusLoss} onClick={() => format("underline")}>
              <u>U</u>
            </button>
            <button type="button" className="tool-btn" onMouseDown={preventFocusLoss} onClick={() => format("strikeThrough")}>
              <s>S</s>
            </button>

            <div className="alignment-tools">
              <button
                type="button"
                className="align-btn"
                onMouseDown={preventFocusLoss}
                onClick={() => format("justifyLeft")}
                title="Left"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M3 5h18 M3 9h12 M3 13h18 M3 17h12" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </button>
              <button
                type="button"
                className="align-btn"
                onMouseDown={preventFocusLoss}
                onClick={() => format("justifyCenter")}
                title="Center"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M3 5h18 M6 9h12 M3 13h18 M6 17h12" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </button>
              <button
                type="button"
                className="align-btn"
                onMouseDown={preventFocusLoss}
                onClick={() => format("justifyRight")}
                title="Right"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M3 5h18 M9 9h12 M3 13h18 M9 17h12" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </button>
              <button
                type="button"
                className="align-btn"
                onMouseDown={preventFocusLoss}
                onClick={() => format("justifyFull")}
                title="Justify"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M3 5h18 M3 9h18 M3 13h18 M3 17h18" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </button>
            </div>

            <div className="line-spacing-wrapper" title="Line Spacing">
              <svg viewBox="0 0 36 24" fill="none">
                <path
                  d="M6 10V4M6 4L3.5 6.5M6 4L8.5 6.5"
                  stroke="#1864ab"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6 14V20M6 20L3.5 17.5M6 20L8.5 17.5"
                  stroke="#1864ab"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 5.5H23M12 9.8H23M12 14.2H23M12 18.5H23"
                  stroke="#333"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M27.5 10.5L30.5 13.5L33.5 10.5"
                  stroke="#333"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <select defaultValue="1.5" onChange={(e) => setLineSpacing(e.target.value)}>
                <option value="1">1.0</option>
                <option value="1.15">1.15</option>
                <option value="1.5">1.5</option>
                <option value="2">2.0</option>
                <option value="2.5">2.5</option>
              </select>
            </div>

            <div className="line-spacing-wrapper" title="Letter Spacing">
              <svg viewBox="0 0 36 24" fill="none">
                <path
                  d="M4.5 14L8 4.5L11.5 14M5.7 11.2H10.3"
                  stroke="#333"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M13 4.5L16.5 14L20 4.5"
                  stroke="#333"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 18.5H20.5M4 18.5L6.2 16.5M4 18.5L6.2 20.5M20.5 18.5L18.3 16.5M20.5 18.5L18.3 20.5"
                  stroke="#1864ab"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M27.5 10.5L30.5 13.5L33.5 10.5"
                  stroke="#333"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <select defaultValue="normal" onChange={(e) => setLetterSpacing(e.target.value)}>
                <option value="-1px">Tight</option>
                <option value="normal">Normal</option>
                <option value="1px">Loose</option>
                <option value="2px">2px</option>
                <option value="4px">4px</option>
              </select>
            </div>

            <label className="color-box" title="Background">
              <input
                type="color"
                value={pageBg}
                onChange={(e) => {
                  setPageBg(e.target.value);
                  if (pageRef.current) pageRef.current.style.backgroundColor = e.target.value;
                }}
              />
            </label>

            <button type="button" className="tool-btn" onMouseDown={preventFocusLoss} onClick={() => format("undo")} title="Undo">
              ↶
            </button>
            <button type="button" className="tool-btn" onMouseDown={preventFocusLoss} onClick={() => format("redo")} title="Redo">
              ↷
            </button>
          </div>

          {/* TEXT EFFECTS POPUP */}
          <div
            id="effectsMenu"
            ref={effectsMenuRef}
            className={`effects-menu${effectsOpen ? " open" : ""}`}
            onMouseDown={preventFocusLoss}
          >
            <div className="preset-grid">
              {Array.from({ length: 15 }, (_, idx) => {
                const fxClass = `fx-${idx + 1}`;
                return (
                  <div
                    key={fxClass}
                    className={`preset-item ${fxClass}`}
                    onClick={() => applyTextPreset(fxClass)}
                  >
                    A
                  </div>
                );
              })}
            </div>
            <div className="fx-options">
              <div className="fx-option" onClick={() => applyCustomEffect("outline")}>
                <div className="fx-option-left">
                  <span
                    className="fx-icon-badge"
                    style={{
                      color: "#fff",
                      WebkitTextStroke: "1px #222",
                      borderBottom: "2px solid #000",
                    }}
                  >
                    A
                  </span>
                  Outline
                </div>
                <span>›</span>
              </div>
              <div className="fx-option" onClick={() => applyCustomEffect("shadow")}>
                <div className="fx-option-left">
                  <span className="fx-icon-badge" style={{ textShadow: "2px 2px 2px #666" }}>
                    A
                  </span>
                  Shadow
                </div>
                <span>›</span>
              </div>
              <div className="fx-option" onClick={() => applyCustomEffect("reflection")}>
                <div className="fx-option-left">
                  <span
                    className="fx-icon-badge"
                    style={{
                      WebkitBoxReflect: "below -5px linear-gradient(transparent,#888)",
                    } as React.CSSProperties}
                  >
                    A
                  </span>
                  Reflection
                </div>
                <span>›</span>
              </div>
              <div className="fx-option" onClick={() => applyCustomEffect("glow")}>
                <div className="fx-option-left">
                  <span className="fx-icon-badge" style={{ textShadow: "0 0 5px #4472c4" }}>
                    A
                  </span>
                  Glow
                </div>
                <span>›</span>
              </div>
              <div className="fx-option" onClick={() => applyCustomEffect("numberStyles")}>
                <div className="fx-option-left">
                  <span className="fx-icon-badge" style={{ fontSize: "11px", color: "#555" }}>
                    123
                  </span>
                  Number Styles
                </div>
                <span>›</span>
              </div>
              <div className="fx-option" onClick={() => applyCustomEffect("ligatures")}>
                <div className="fx-option-left">
                  <span
                    className="fx-icon-badge"
                    style={{ fontFamily: "Georgia,serif", color: "#555" }}
                  >
                    fi
                  </span>
                  Ligatures
                </div>
                <span>›</span>
              </div>
              <div className="fx-option" onClick={() => applyCustomEffect("stylisticSets")}>
                <div className="fx-option-left">
                  <span
                    className="fx-icon-badge"
                    style={{
                      fontStyle: "italic",
                      fontFamily: "Georgia,serif",
                      fontSize: "12px",
                      color: "#555",
                    }}
                  >
                    abc
                  </span>
                  Stylistic Sets
                </div>
                <span>›</span>
              </div>
            </div>
          </div>
        </div>

        {/* DOCUMENT AREA - ONLY THIS AREA SCROLLS MANUALLY */}
        <div className="document-area">
          <div className="page-wrapper">
            <div className="floating-page-actions">
              <button
                type="button"
                className="tool-btn"
                onMouseDown={preventFocusLoss}
                onClick={handleClose}
                aria-label="Close editor"
              >
                ✕
              </button>
            </div>
            <div id="page" ref={pageRef} className="page" contentEditable={true} spellCheck={true} />
          </div>

          {/* FLOATING SEND BUTTON */}
          <button
            type="button"
            className="floating-send-btn"
            onMouseDown={preventFocusLoss}
            onClick={handleSend}
            aria-label="Send post"
          >
            <svg viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
