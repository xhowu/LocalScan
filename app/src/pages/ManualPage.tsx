/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { goBack } from '../router';
import { APP_VERSION } from '../lib/app-const';
import { MANUAL_HTML } from '../lib/manual-html';
import { consumeManualJump } from '../lib/manual-jump';

type TocItem = { id: string; text: string; children: TocItem[] };

/**
 * 跳转控件的上下箭头：与仓库抽屉标题右侧红色箭头标同款开角的 chevron，
 * 用 SVG 旋转出朝上/朝下两个方向（字符 ˄˅ 的开角与它不一致）。
 */
function Chevron({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ transform: dir === 'up' ? 'rotate(-90deg)' : 'rotate(90deg)' }}
    >
      {/* 与抽屉箭头同源：右向 chevron，旋转得到上下 */}
      <path
        d="M9 5.5 L15.5 12 L9 18.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * App 使用手册：内容来自 lib/manual-html.ts（docs md 的转换产物）。
 * 目录从内容里的 h2[id] / h3[id] 自动提取（h2 章节、h3 小节），点击平滑跳转。
 * 搜索：全文按字符匹配，命中的关键词荧光高亮、不隐藏任何内容，
 * 右上角 ˄N/M˅ 控件在命中处之间逐个跳转。
 */
export function ManualPage() {
  const [query, setQuery] = useState('');
  const [tocOpen, setTocOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  /** 搜索命中的 <mark> 元素与当前跳转位置 */
  const markEls = useRef<HTMLElement[]>([]);
  const [matchIdx, setMatchIdx] = useState(0);
  const [matchTotal, setMatchTotal] = useState(0);
  /** 目录展开状态：key 为章节 id（主目录与浮球抽屉共用） */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  /** 清掉上一轮的荧光标记（<mark class="mh"> 还原为纯文本） */
  function clearMarks(root: HTMLElement) {
    root.querySelectorAll('mark.mh').forEach((m) => {
      const parent = m.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(m.textContent ?? ''), m);
        parent.normalize();
      }
    });
  }

  /** 荧光笔：把全文所有关键词出现处包上 <mark class="mh">（大小写不敏感） */
  function markKeyword(root: HTMLElement, kw: string) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const targets: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.nodeValue && node.nodeValue.toLowerCase().includes(kw)) targets.push(node);
    }
    for (const node of targets) {
      const text = node.nodeValue ?? '';
      const frag = document.createDocumentFragment();
      let i = 0;
      let at = text.toLowerCase().indexOf(kw);
      while (at >= 0) {
        if (at > i) frag.appendChild(document.createTextNode(text.slice(i, at)));
        const mark = document.createElement('mark');
        mark.className = 'mh';
        mark.textContent = text.slice(at, at + kw.length);
        frag.appendChild(mark);
        i = at + kw.length;
        at = text.toLowerCase().indexOf(kw, i);
      }
      if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
      node.parentNode?.replaceChild(frag, node);
    }
  }

  /** 目录：h2 为章，其后连续的 h3 为小节 */
  const toc = useMemo<TocItem[]>(() => {
    const box = document.createElement('div');
    box.innerHTML = MANUAL_HTML;
    const items: TocItem[] = [];
    let cur: TocItem | null = null;
    box.querySelectorAll('h2[id], h3[id]').forEach((h) => {
      if (h.tagName === 'H2') {
        cur = { id: h.id, text: h.textContent ?? '', children: [] };
        items.push(cur);
      } else if (cur) {
        cur.children.push({ id: h.id, text: h.textContent ?? '', children: [] });
      }
    });
    return items;
  }, []);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    clearMarks(root);
    const kw = query.trim().toLowerCase();
    if (!kw) {
      root.querySelectorAll('.manual-doc > *').forEach((el) => {
        (el as HTMLElement).style.display = '';
      });
      markEls.current = [];
      setMatchTotal(0);
      setMatchIdx(0);
      return;
    }
    // 全文匹配：不隐藏任何内容，命中处荧光标记
    markKeyword(root, kw);
    const marks = Array.from(root.querySelectorAll('mark.mh')) as HTMLElement[];
    markEls.current = marks;
    setMatchTotal(marks.length);
    setMatchIdx(0);
  }, [query]);

  /** 回车：立刻前往第一处命中（并高亮为当前处） */
  function jumpFirst() {
    const total = markEls.current.length;
    if (!total) return;
    markEls.current[matchIdx]?.classList.remove('cur');
    setMatchIdx(0);
    const el = markEls.current[0];
    el?.classList.add('cur');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function jumpMatch(delta: number) {
    const total = markEls.current.length;
    if (!total) return;
    const prev = markEls.current[matchIdx];
    prev?.classList.remove('cur');
    const next = (matchIdx + delta + total) % total;
    setMatchIdx(next);
    const el = markEls.current[next];
    el?.classList.add('cur');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function jump(id: string) {
    contentRef.current
      ?.querySelector(`#${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** 来自关于页功能表的直达跳转：挂载后消费握手键，滚到对应章节 */
  useEffect(() => {
    const sec = consumeManualJump();
    if (!sec) return;
    // 等内容与布局就绪后再滚，保证目标位置计算正确
    const t = window.setTimeout(() => jump(sec), 120);
    return () => window.clearTimeout(t);
  }, []);

  function jumpFromOverlay(id: string) {
    setTocOpen(false);
    // 等浮层收起后再跳，保证滚动目标位置计算正确
    window.setTimeout(() => jump(id), 60);
  }

  /** 目录行：与主目录同款 —— 文字左对齐、箭头右对齐、奇偶行斑马纹；有子项可展开 */
  function tocRows(list: TocItem[], onJump: (id: string) => void, depth = 0) {
    const rows: Array<{ item: TocItem; flatIndex: number; depth: number }> = [];
    let flat = 0;
    for (const item of list) {
      rows.push({ item, flatIndex: flat, depth });
      flat += 1;
      if (item.children.length && expanded.has(item.id)) {
        for (const c of item.children) {
          rows.push({ item: c, flatIndex: flat, depth: depth + 1 });
          flat += 1;
        }
      }
    }
    return rows.map(({ item, flatIndex, depth }) => {
      const hasKids = depth === 0 && item.children.length > 0;
      const open = expanded.has(item.id);
      return (
        <li key={item.id}>
          {/* 斑马纹放在行容器上：内部是并排的「跳转按钮 + 展开按钮」，避免 button 嵌套 */}
          <div className={`toc-line${flatIndex % 2 ? ' odd' : ''}`}>
            <button
              type="button"
              className={`toc-row${depth ? ' sub' : ''}`}
              onClick={() => onJump(item.id)}
            >
              <span>{item.text}</span>
              {!hasKids && (
                <span className="toc-arrow" aria-hidden="true">
                  ›
                </span>
              )}
            </button>
            {hasKids && (
              <button
                type="button"
                className="toc-expand"
                aria-label={open ? '收起子项' : '展开子项'}
                onClick={() => toggleExpand(item.id)}
              >
                {open ? '▾' : '▸'}
              </button>
            )}
          </div>
        </li>
      );
    });
  }

  return (
    <div className="page manual-page">
      {/* 搜索命中后的跳转控件：页面第一个元素 + sticky top:0 ——
          初始位置就在顶栏正下方，滚动时吸在同一高度，永不跳位 */}
      <div className="manual-jump-slot">
        {query.trim() && matchTotal > 0 ? (
          <div className="manual-jump">
            <button type="button" onClick={() => jumpMatch(-1)} aria-label="上一处">
              <Chevron dir="up" />
            </button>
            <span className="mono">
              {matchIdx + 1}/{matchTotal}
            </span>
            <button type="button" onClick={() => jumpMatch(1)} aria-label="下一处">
              <Chevron dir="down" />
            </button>
          </div>
        ) : null}
      </div>

      <header className="nav-bar">
        <button type="button" className="back-btn" onClick={() => goBack({ name: 'about' })}>
          ←
        </button>
        <h1>App 使用手册</h1>
        <span />
      </header>

      <p className="lead field-sub mono">
        v{APP_VERSION} · 与当前实现逐条对应 · 共 {toc.length} 章
      </p>

      <label className="field manual-search">
        <span>搜索手册（全文匹配关键词并荧光高亮，不隐藏内容）</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              jumpFirst();
              (e.target as HTMLInputElement).blur();
            }
          }}
          enterKeyHint="search"
          placeholder="输入关键词，回车前往第一处"
        />
      </label>
      <nav className="manual-toc" aria-label="手册目录">
        <p className="manual-toc-title">目录</p>
        <ol>{tocRows(toc, jump)}</ol>
      </nav>

      <div
        ref={contentRef}
        className="manual-content"
        dangerouslySetInnerHTML={{ __html: MANUAL_HTML }}
      />

      <button
        type="button"
        className="manual-fab"
        onClick={() => setTocOpen((v) => !v)}
        aria-label="打开目录"
      >
        目录
      </button>

      {tocOpen && (
        <div className="manual-overlay" onClick={() => setTocOpen(false)}>
          <div className="manual-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="manual-sheet-head">
              <b>目录</b>
              <button
                type="button"
                className="btn-ghost sm"
                onClick={() => setTocOpen(false)}
              >
                关闭
              </button>
            </div>
            <ol className="manual-sheet-toc">{tocRows(toc, jumpFromOverlay)}</ol>
          </div>
        </div>
      )}
    </div>
  );
}
