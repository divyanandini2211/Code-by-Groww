import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Trash2, Sparkles, Bot, AlertCircle, TrendingUp } from 'lucide-react';
import { api } from '../services/api';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  timestamp: string;
}

interface WatchlistChatDrawerProps {
  watchlistId: string;
  watchlistName: string;
  stocksCount: number;
  topStockSymbol?: string;
  isSidebarCollapsed?: boolean;
  leftOffset?: number;
  forceOpenTrigger?: number;
}

// Inline token renderer for **bold**, `code`, and [SIGNAL] tags
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[A-Za-z0-9_\-]+\])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      const boldContent = token.slice(2, -2).trim();
      const isPositive = boldContent.startsWith('+') || (boldContent.includes('%') && !boldContent.includes('-'));
      const isNegative = boldContent.startsWith('-') || boldContent.includes('-%');

      let color = 'var(--text-primary)';
      if (isPositive && !isNegative) color = 'var(--groww-green)';
      else if (isNegative) color = 'var(--groww-red)';

      parts.push(
        <strong key={`${match.index}-${token}`} style={{ fontWeight: 700, color }}>
          {boldContent}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      const codeContent = token.slice(1, -1);
      parts.push(
        <code
          key={`${match.index}-${token}`}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            padding: '1px 5px',
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'monospace',
            color: 'var(--groww-green)'
          }}
        >
          {codeContent}
        </code>
      );
    } else if (token.startsWith('[') && token.endsWith(']')) {
      const signalContent = token.slice(1, -1);
      const isNegativeSignal = signalContent.includes('LOW') || signalContent.includes('DROP') || signalContent.includes('BEAR');
      const isAmberSignal = signalContent.includes('VOL') || signalContent.includes('SURGE') || signalContent.includes('SPIKE');

      let badgeBg = 'rgba(0, 208, 156, 0.12)';
      let badgeBorder = 'rgba(0, 208, 156, 0.25)';
      let badgeColor = 'var(--groww-green)';

      if (isNegativeSignal) {
        badgeBg = 'rgba(235, 91, 60, 0.12)';
        badgeBorder = 'rgba(235, 91, 60, 0.25)';
        badgeColor = 'var(--groww-red)';
      } else if (isAmberSignal) {
        badgeBg = 'rgba(255, 186, 0, 0.12)';
        badgeBorder = 'rgba(255, 186, 0, 0.25)';
        badgeColor = 'var(--groww-amber)';
      }

      parts.push(
        <span
          key={`${match.index}-${token}`}
          style={{
            display: 'inline-block',
            fontSize: '9.5px',
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: '4px',
            background: badgeBg,
            border: `1px solid ${badgeBorder}`,
            color: badgeColor,
            margin: '0 3px',
            letterSpacing: '0.4px',
            verticalAlign: 'baseline'
          }}
        >
          {signalContent}
        </span>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

// Block renderer for structured paragraphs, bullet points, and ordered lists
function FormattedMessage({ text }: { text: string }) {
  // Normalize redundant double asterisks and clean up formatting
  const sanitizedText = text
    .replace(/\*\*\s*\*\*/g, '')
    .replace(/\*\*([A-Za-z0-9\s]+):\*\*\s*\*\*([^\*\n]+)\*\*/g, '$1: **$2**')
    .replace(/\*\*([A-Za-z0-9\s]+)\*\*:\s*\*\*([^\*\n]+)\*\*/g, '$1: **$2**');

  const lines = sanitizedText.split('\n');
  const blocks: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushList = () => {
    if (currentList) {
      if (currentList.type === 'ul') {
        blocks.push(
          <ul
            key={`list-${blocks.length}`}
            style={{
              margin: '6px 0',
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            {currentList.items.map((item, idx) => (
              <li
                key={idx}
                style={{
                  position: 'relative',
                  paddingLeft: '14px',
                  lineHeight: '1.45',
                  color: 'var(--text-secondary)'
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: '2px',
                    top: '7px',
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: 'var(--groww-green)'
                  }}
                />
                <span style={{ color: 'var(--text-primary)' }}>{renderInline(item)}</span>
              </li>
            ))}
          </ul>
        );
      } else {
        blocks.push(
          <ol
            key={`list-${blocks.length}`}
            style={{
              margin: '6px 0',
              paddingLeft: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            {currentList.items.map((item, idx) => (
              <li key={idx} style={{ lineHeight: '1.45', color: 'var(--text-primary)' }}>
                {renderInline(item)}
              </li>
            ))}
          </ol>
        );
      }
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Match bullet points: *, -, •
    const bulletMatch = trimmed.match(/^[\*\-•]\s*(.*)$/);
    if (bulletMatch && bulletMatch[1]) {
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    // Match numbered list: 1. or 2.
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch && numMatch[2]) {
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(numMatch[2]);
      continue;
    }

    // Regular paragraph
    flushList();
    blocks.push(
      <p key={`p-${blocks.length}`} style={{ margin: '3px 0', lineHeight: '1.45', color: 'var(--text-primary)' }}>
        {renderInline(trimmed)}
      </p>
    );
  }

  flushList();

  return <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{blocks}</div>;
}

export const WatchlistChatDrawer: React.FC<WatchlistChatDrawerProps> = ({
  watchlistId,
  watchlistName,
  stocksCount,
  topStockSymbol,
  isSidebarCollapsed = false,
  leftOffset = 222,
  forceOpenTrigger
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleOpen = () => {
    setIsOpen(true);
    setIsClosing(false);
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 260);
  };

  // External trigger to open drawer (e.g. from Try Me popup)
  useEffect(() => {
    if (forceOpenTrigger && forceOpenTrigger > 0) {
      handleOpen();
    }
  }, [forceOpenTrigger]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputText).trim();
    if (!textToSend || !watchlistId || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setInputText('');
    setIsLoading(true);

    try {
      // Build history payload for conversation context
      const historyPayload = messages.slice(-4).map(m => ({
        role: m.role,
        text: m.text
      }));

      const res = await api.sendWatchlistChatMessage(watchlistId, textToSend, historyPayload);

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: res.reply || 'No response generated.',
        modelUsed: res.model_used,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: 'Unable to reach the assistant at the moment. Please try again.',
        modelUsed: 'network_fallback',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const quickPrompts = [
    'Which stock has the highest volume surge?',
    'What changed the most while I was away?',
    topStockSymbol ? `Analyze ${topStockSymbol}'s price action` : 'Any breakout signals?',
    'Are any stocks near their 52-week high?'
  ];

  return (
    <>
      {/* In-Sidebar Trigger Section - Positioned right above DEMO CONTROLS */}
      {!isSidebarCollapsed ? (
        <div style={{
          padding: '10px 12px',
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          position: 'relative'
        }}>
          {/* Playful Cartoon 'Try me!' Speech Bubble */}
          <div
            onClick={handleOpen}
            style={{
              alignSelf: 'flex-start',
              cursor: 'pointer',
              animation: 'cartoonWiggle 2.6s ease-in-out infinite',
              transformOrigin: 'bottom left',
              userSelect: 'none',
              marginBottom: '-2px'
            }}
            title="Click to try Watchlist AI!"
          >
            <div
              style={{
                background: 'linear-gradient(135deg, #00d09c 0%, #00b386 100%)',
                color: '#000',
                fontWeight: 800,
                fontSize: '10.5px',
                padding: '3px 10px',
                borderRadius: '12px',
                boxShadow: '0 4px 14px rgba(0, 208, 156, 0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                letterSpacing: '0.2px',
                border: '1.5px solid #ffffff'
              }}
            >
              <Sparkles size={11} color="#000" />
              <span>Try me!</span>
            </div>
          </div>

          {/* Launcher Button */}
          <button
            onClick={handleOpen}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #00d09c 0%, #00a87e 100%)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontWeight: 700,
              fontSize: '12px',
              boxShadow: '0 4px 14px rgba(0, 208, 156, 0.25)',
              cursor: 'pointer',
              transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02) translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 18px rgba(0, 208, 156, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1) translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 208, 156, 0.25)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Bot size={15} color="#000" />
              <span>Watchlist AI</span>
            </div>
            <span style={{
              background: '#000',
              color: '#00d09c',
              borderRadius: '8px',
              padding: '1px 5px',
              fontSize: '9px',
              fontWeight: 800
            }}>
              Live
            </span>
          </button>
        </div>
      ) : (
        <div style={{
          padding: '8px 4px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'center',
          position: 'relative'
        }}>
          <button
            onClick={handleOpen}
            title="Watchlist AI (Try me!)"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #00d09c 0%, #00a87e 100%)',
              color: '#000',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 208, 156, 0.35)',
              transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <Bot size={17} color="#000" />
          </button>
        </div>
      )}

      {/* Expanded Chat Drawer with Cartoon Expand / Shrink Anchored to Sidebar or Centered on Mobile */}
      {(isOpen || isClosing) && (
        <div 
          className="watchlist-chat-drawer"
          style={{
            position: 'fixed',
            bottom: isMobile ? '16px' : '24px',
            left: isMobile ? '12px' : `${leftOffset}px`,
            right: isMobile ? '12px' : 'auto',
            margin: isMobile ? '0 auto' : '0',
            width: isMobile ? 'min(420px, calc(100vw - 24px))' : '390px',
            maxWidth: 'calc(100vw - 24px)',
            height: isMobile ? '520px' : '540px',
            maxHeight: isMobile ? 'calc(100vh - 32px)' : 'calc(100vh - 48px)',
            background: 'rgba(22, 27, 38, 0.96)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.75)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1001,
            overflow: 'hidden',
            animation: isClosing
              ? (isMobile ? 'cartoonShrinkCenter 0.26s cubic-bezier(0.4, 0, 0.2, 1) forwards' : 'cartoonShrinkLeft 0.26s cubic-bezier(0.4, 0, 0.2, 1) forwards')
              : (isMobile ? 'cartoonExpandCenter 0.48s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' : 'cartoonExpandLeft 0.48s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'),
            transformOrigin: isMobile ? 'bottom center' : 'bottom left'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-card)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: 'rgba(0, 208, 156, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--groww-green)'
              }}>
                <Bot size={16} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>Watchlist Assistant</span>
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    background: 'rgba(0, 208, 156, 0.15)',
                    color: 'var(--groww-green)',
                    padding: '1px 5px',
                    borderRadius: '4px'
                  }}>
                    gemini-3.5-flash-lite
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  Connected to <b style={{ color: 'var(--text-secondary)' }}>{watchlistName}</b> ({stocksCount} stocks)
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  title="Clear conversation"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}
              <button
                onClick={handleClose}
                title="Minimize assistant"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            {/* Welcome message when thread is empty */}
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                <div style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '12px',
                  lineHeight: '1.45',
                  color: 'var(--text-secondary)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--groww-green)', fontWeight: 700, marginBottom: '4px' }}>
                    <Sparkles size={13} /> Real-time Watchlist Intelligence
                  </div>
                  Ask any question about <b>{watchlistName}</b>. I have live access to current prices, anomaly attention scores, volume spikes, and 52-week ranges.
                </div>

                {/* Quick prompt pills */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Suggested Questions:</span>
                  {quickPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(prompt)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '7px 10px',
                        fontSize: '11px',
                        textAlign: 'left',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        transition: 'background 0.15s, border-color 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 208, 156, 0.08)';
                        e.currentTarget.style.borderColor = 'rgba(0, 208, 156, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                      }}
                    >
                      💡 {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: '2px'
                }}
              >
                <div style={{
                  maxWidth: '85%',
                  padding: '9px 12px',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: msg.role === 'user'
                    ? 'rgba(0, 208, 156, 0.18)'
                    : 'var(--bg-card)',
                  border: msg.role === 'user'
                    ? '1px solid rgba(0, 208, 156, 0.35)'
                    : '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  lineHeight: '1.45',
                  wordBreak: 'break-word'
                }}>
                  {msg.role === 'user' ? (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                  ) : (
                    <FormattedMessage text={msg.text} />
                  )}
                </div>
                <div style={{
                  fontSize: '9px',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  gap: '6px',
                  padding: '0 4px'
                }}>
                  <span>{msg.timestamp}</span>
                  {msg.modelUsed && msg.role === 'model' && (
                    <span style={{ color: msg.modelUsed.includes('guardrail') ? 'var(--groww-amber)' : 'var(--groww-green)' }}>
                      • {msg.modelUsed}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', maxWidth: '75%' }}>
                <Sparkles size={13} color="var(--groww-green)" className="animate-spin" />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Analyzing watchlist metrics...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input Bar */}
          <div style={{
            padding: '10px 12px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <input
              type="text"
              placeholder={`Ask about ${watchlistName}...`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              style={{
                flex: 1,
                height: '34px',
                fontSize: '12px',
                padding: '0 12px',
                borderRadius: '6px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isLoading || !inputText.trim()}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '6px',
                background: inputText.trim() && !isLoading ? 'var(--groww-green)' : 'var(--border-color)',
                color: '#000',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: inputText.trim() && !isLoading ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s'
              }}
            >
              <Send size={14} color="#000" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
