import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useGetChatSummary, useListChatMessages, useSendChatMessage, getGetChatSummaryQueryKey, getListChatMessagesQueryKey } from '@workspace/api-client-react';
import type { ChatMessage } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ArrowDown, ArrowRight, Check, CircleAlert, Clock3, MessageCircle, MessageSquareText, Pencil, RefreshCw, Send, Users, X } from 'lucide-react';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const NAME_STORAGE_KEY = 'gather-room-name';

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '·';
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Earlier';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function readableError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Something got in the way. Please try again in a moment.';
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={RoomPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function RoomPage() {
  const queryClient = useQueryClient();
  const messagesQuery = useListChatMessages({ limit: 100 }, { query: { queryKey: getListChatMessagesQueryKey({ limit: 100 }), refetchInterval: 2500, refetchIntervalInBackground: true } });
  const summaryQuery = useGetChatSummary({ query: { queryKey: getGetChatSummaryQueryKey(), refetchInterval: 10000, refetchIntervalInBackground: true } });
  const sendMutation = useSendChatMessage();
  const [name, setName] = useState(() => {
    try { return window.localStorage.getItem(NAME_STORAGE_KEY) ?? ''; } catch { return ''; }
  });
  const [nameDraft, setNameDraft] = useState(name);
  const [nameMode, setNameMode] = useState(!name);
  const [draft, setDraft] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const latestMessage = messagesQuery.data?.[messagesQuery.data.length - 1];
  const messages = messagesQuery.data ?? [];

  useEffect(() => {
    setNameDraft(name);
    setNameMode(!name);
  }, [name]);

  useEffect(() => {
    const node = messageScrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const groupedMessages = useMemo(() => {
    const groups: { label: string; messages: ChatMessage[] }[] = [];
    messages.forEach((message) => {
      const label = dayLabel(message.createdAt);
      const group = groups[groups.length - 1];
      if (!group || group.label !== label) groups.push({ label, messages: [message] });
      else group.messages.push(message);
    });
    return groups;
  }, [messages]);

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = nameDraft.trim().replace(/\s+/g, ' ').slice(0, 32);
    if (!cleanName) return;
    setName(cleanName);
    setNameMode(false);
    try { window.localStorage.setItem(NAME_STORAGE_KEY, cleanName); } catch { /* local persistence can be unavailable */ }
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !name || sendMutation.isPending) return;
    sendMutation.mutate({ data: { authorName: name, content } }, {
      onSuccess: async () => {
        setDraft('');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey({ limit: 100 }) }),
          queryClient.invalidateQueries({ queryKey: getGetChatSummaryQueryKey() }),
        ]);
      },
    });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function onScroll() {
    const node = messageScrollRef.current;
    if (!node) return;
    setShowScrollButton(node.scrollHeight - node.scrollTop - node.clientHeight > 180);
  }

  function scrollToLatest() {
    messageScrollRef.current?.scrollTo({ top: messageScrollRef.current.scrollHeight, behavior: 'smooth' });
    setShowScrollButton(false);
  }

  const roomError = messagesQuery.isError;
  const summary = summaryQuery.data;

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#f2efe5] px-4 py-5 text-[#16343b] sm:px-7 sm:py-7">
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-44 h-[32rem] w-[32rem] rounded-full border border-[#dcd7c8] opacity-60" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-28 h-[22rem] w-[22rem] rounded-full border border-[#dcd7c8] opacity-60" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 h-64 w-64 -translate-x-1/2 translate-y-1/2 rounded-full bg-[#dcebe6] opacity-70 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100dvh-2.5rem)] max-w-[1320px] flex-col sm:min-h-[calc(100dvh-3.5rem)]">
        <header className="mb-6 flex items-center justify-between sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-[15px] bg-[#16343b] text-[#f3b39a] shadow-sm">
              <MessageCircle size={21} strokeWidth={1.8} />
              <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-[3px] border-[#f2efe5] bg-[#83afa0]" />
            </div>
            <div>
              <div className="font-serif text-[22px] leading-none tracking-[-.04em]">the commons</div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[.19em] text-[#718184]">a room for all of us</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-full border border-[#d8d3c5] bg-[#f8f6ef]/80 px-3 py-2 sm:px-4">
            <span className="presence-dot h-2 w-2 rounded-full bg-[#6d9d8d]" />
            <span className="font-mono text-[10px] uppercase tracking-[.12em] text-[#496065]">open room</span>
          </div>
        </header>

        <div className="mb-5 grid gap-5 lg:mb-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="flex flex-col justify-center rounded-[26px] bg-[#16343b] px-6 py-7 text-[#f6f2e8] shadow-[0_18px_50px_rgba(22,52,59,.12)] sm:px-9 sm:py-8">
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-[#a9c5bb]">
              <span className="h-px w-5 bg-[#df997f]" />
              One room, many little moments
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-serif text-[clamp(2.4rem,5vw,4rem)] leading-[.98] tracking-[-.055em]">Come as you are.</h1>
                <p className="mt-3 max-w-[570px] text-[14px] leading-6 text-[#c0cfca] sm:text-[15px]">A shared corner of the internet for passing thoughts, small updates, and catching up.</p>
              </div>
              <div className="hidden select-none items-center gap-2 pb-1 font-mono text-[10px] uppercase tracking-[.16em] text-[#8ea8a2] md:flex">
                <span className="h-8 w-8 rounded-full border border-[#456269] p-[7px]"><span className="block h-full w-full rounded-full border border-[#df997f]" /></span>
                pull up a chair
              </div>
            </div>
          </section>

          <aside className="grid grid-cols-3 gap-2.5 lg:grid-cols-1 lg:gap-3" aria-label="Room activity">
            <StatCard icon={<Users size={15} />} label="Here lately" value={summaryQuery.isLoading ? '—' : summary?.participantCount ?? 0} hint="people in the room" />
            <StatCard icon={<MessageSquareText size={15} />} label="Messages today" value={summaryQuery.isLoading ? '—' : summary?.todayMessageCount ?? 0} hint="and counting" />
            <StatCard icon={<Clock3 size={15} />} label="All-time notes" value={summaryQuery.isLoading ? '—' : summary?.messageCount ?? 0} hint={summary?.lastActivity ? `last here ${formatTime(summary.lastActivity)}` : 'the room is just warming up'} />
          </aside>
        </div>

        <section className="relative flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-[26px] border border-[#dcd7c8] bg-[#fbfaf5] shadow-[0_12px_42px_rgba(35,56,58,.07)]">
          <div className="flex items-center justify-between border-b border-[#e7e3d9] px-5 py-4 sm:px-7">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#e7eee8] text-[#426d64]"><MessageSquareText size={17} /></div>
              <div>
                <h2 className="font-semibold leading-tight">The conversation</h2>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[.12em] text-[#87918e]">
                  {messagesQuery.isLoading ? 'finding the thread' : `${summary?.messageCount ?? messages.length} notes in the room`}
                </p>
              </div>
            </div>
            {name ? (
              <button
                type="button"
                onClick={() => { setNameDraft(name); setNameMode(true); }}
                className="group flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-left transition-colors hover:bg-[#f0eee6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d77f64]"
                data-testid="button-edit-display-name"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f2ded4] font-mono text-[10px] font-medium text-[#854b3b]">{initials(name)}</span>
                <span className="hidden max-w-[105px] truncate text-xs font-medium sm:inline">{name}</span>
                <Pencil size={12} className="text-[#9a9c91] transition-colors group-hover:text-[#d77f64]" />
              </button>
            ) : (
              <span className="rounded-full bg-[#f0eee6] px-3 py-2 font-mono text-[9px] uppercase tracking-[.11em] text-[#77817e]">visitor</span>
            )}
          </div>

          {roomError ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center" role="alert" data-testid="status-messages-error">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f7e6df] text-[#b75f4e]"><CircleAlert size={21} /></div>
              <h3 className="font-serif text-2xl">We lost the thread.</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#718184]">{readableError(messagesQuery.error)}</p>
              <button onClick={() => { void messagesQuery.refetch(); void summaryQuery.refetch(); }} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#16343b] px-4 py-2.5 text-xs font-semibold text-[#f6f2e8] transition-transform hover:-translate-y-0.5" data-testid="button-retry-messages">
                <RefreshCw size={14} /> Try again
              </button>
            </div>
          ) : messagesQuery.isLoading ? (
            <MessageSkeleton />
          ) : messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center" data-testid="empty-messages">
              <div className="relative mb-5 flex h-[74px] w-[74px] items-center justify-center rounded-[26px] bg-[#e8eee8] text-[#517669]">
                <MessageCircle size={30} strokeWidth={1.5} />
                <span className="absolute -right-1 top-1 h-3 w-3 rounded-full bg-[#df997f]" />
              </div>
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[.2em] text-[#9a8a76]">A little quiet in here</p>
              <h3 className="font-serif text-[27px] tracking-[-.035em]">Start the first thread.</h3>
              <p className="mt-2 max-w-[330px] text-sm leading-6 text-[#77817e]">Drop a hello, a thought, or something worth passing around. This room is yours too.</p>
            </div>
          ) : (
            <div ref={messageScrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-6 sm:px-8" aria-live="polite" data-testid="list-chat-messages">
              <div className="mx-auto max-w-[780px]">
                <div className="mb-6 flex items-center gap-3">
                  <span className="h-px flex-1 bg-[#ece9e1]" />
                  <span className="font-mono text-[9px] uppercase tracking-[.16em] text-[#a19c8e]">You found your people</span>
                  <span className="h-px flex-1 bg-[#ece9e1]" />
                </div>
                {groupedMessages.map((group, groupIndex) => (
                  <div key={`${group.label}-${groupIndex}`}>
                    <div className="my-5 flex items-center gap-3">
                      <span className="h-px flex-1 bg-[#ece9e1]" />
                      <span className="rounded-full bg-[#f0eee6] px-3 py-1 font-mono text-[9px] uppercase tracking-[.12em] text-[#898b80]">{group.label}</span>
                      <span className="h-px flex-1 bg-[#ece9e1]" />
                    </div>
                    <div className="space-y-4">
                      {group.messages.map((message, index) => (
                        <MessageRow
                          key={message.id}
                          message={message}
                          mine={Boolean(name) && message.authorName.toLowerCase() === name.toLowerCase()}
                          compact={index > 0 && group.messages[index - 1].authorName === message.authorName}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {sendMutation.isPending && (
                  <div className="message-enter mt-4 flex items-center gap-3 pl-1" data-testid="status-message-sending">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f2ded4] font-mono text-[10px] text-[#854b3b]">{initials(name)}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-[#f2efe7] px-4 py-3">
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#678078]" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#678078]" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#678078]" />
                      <span className="ml-1 text-[11px] text-[#77817e]">sending</span>
                    </span>
                  </div>
                )}
                <div ref={(node) => { if (node && latestMessage) node.dataset.latest = latestMessage.id; }} />
              </div>
            </div>
          )}

          {showScrollButton && !roomError && (
            <button onClick={scrollToLatest} className="absolute bottom-[104px] right-6 flex items-center gap-2 rounded-full border border-[#dfdbcf] bg-[#fbfaf5] px-3.5 py-2 text-xs font-semibold shadow-md transition-transform hover:-translate-y-0.5" data-testid="button-scroll-latest">
              <ArrowDown size={14} /> Latest
            </button>
          )}

          <div className="border-t border-[#e7e3d9] bg-[#f8f6ef] px-4 py-4 sm:px-7 sm:py-5">
            {nameMode ? (
              <form onSubmit={saveName} className="mx-auto flex max-w-[780px] flex-col gap-3 sm:flex-row sm:items-center" data-testid="form-display-name">
                <div className="min-w-0 flex-1">
                  <label htmlFor="display-name" className="mb-1.5 block font-mono text-[9px] uppercase tracking-[.15em] text-[#7d8985]">{name ? 'A new name for the room' : 'First, what should we call you?'}</label>
                  <input
                    id="display-name"
                    autoFocus
                    maxLength={32}
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    placeholder="Your display name"
                    className="h-11 w-full rounded-xl border border-[#dcd7c8] bg-[#fbfaf5] px-4 text-sm outline-none transition focus:border-[#d77f64] focus:ring-2 focus:ring-[#d77f64]/15"
                    data-testid="input-display-name"
                  />
                </div>
                <div className="flex gap-2 sm:pt-5">
                  {name && <button type="button" onClick={() => { setNameMode(false); setNameDraft(name); }} className="h-11 rounded-xl px-4 text-xs font-semibold text-[#6c7976] transition hover:bg-[#ece9e1]" data-testid="button-cancel-name">Cancel</button>}
                  <button type="submit" disabled={!nameDraft.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#d77f64] px-5 text-xs font-semibold text-white transition hover:bg-[#c86e55] disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-save-name">
                    {name ? 'Save name' : 'Join the room'} <ArrowRight size={14} />
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={sendMessage} className="mx-auto max-w-[780px]">
                {sendMutation.isError && (
                  <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[#ebc6b9] bg-[#fff5f0] px-3.5 py-2.5 text-xs text-[#9e5142]" role="alert" data-testid="status-send-error">
                    <span className="flex items-center gap-2"><CircleAlert size={15} /> {readableError(sendMutation.error)}</span>
                    <button type="button" className="shrink-0 rounded-md p-1 hover:bg-[#f8e6df]" onClick={() => sendMutation.reset()} aria-label="Dismiss send error" data-testid="button-dismiss-send-error"><X size={14} /></button>
                  </div>
                )}
                <div className="flex items-end gap-2 rounded-[18px] border border-[#ded9cd] bg-[#fbfaf5] p-2 pl-4 transition focus-within:border-[#ca947e] focus-within:ring-2 focus-within:ring-[#d77f64]/10">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
                    onKeyDown={handleComposerKeyDown}
                    rows={1}
                    maxLength={2000}
                    placeholder={`Say something, ${name.split(' ')[0]}…`}
                    className="max-h-32 min-h-[40px] flex-1 resize-y bg-transparent py-2 text-sm leading-5 outline-none placeholder:text-[#a2a096]"
                    aria-label="Write a message"
                    data-testid="input-message"
                  />
                  <div className="flex shrink-0 items-center gap-2 pb-0.5">
                    <span className="hidden font-mono text-[9px] text-[#aaa69b] sm:inline">{draft.length ? `${draft.length}/2000` : '↵ to send'}</span>
                    <button type="submit" disabled={!draft.trim() || sendMutation.isPending} className="group flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#16343b] text-[#f7f2e8] transition-all hover:-translate-y-0.5 hover:bg-[#234952] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0" aria-label="Send message" data-testid="button-send-message">
                      {sendMutation.isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#f7f2e8]/35 border-t-[#f7f2e8]" /> : <Send size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />}
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-[#92958c]">
                  <span>Speaking as <button type="button" onClick={() => { setNameDraft(name); setNameMode(true); }} className="font-semibold text-[#586e69] underline decoration-[#c9d4cb] underline-offset-2 hover:text-[#d77f64]" data-testid="button-change-name">{name}</button></span>
                  <span className="hidden sm:inline">Shift + Enter for a new line</span>
                </div>
              </form>
            )}
          </div>
        </section>

        <footer className="flex items-center justify-between px-1 pb-1 pt-4 text-[10px] text-[#92958c]">
          <span className="font-mono uppercase tracking-[.12em]">A shared room, held lightly.</span>
          {summaryQuery.isError ? (
            <button onClick={() => void summaryQuery.refetch()} className="inline-flex items-center gap-1.5 text-[#a75b4c] hover:underline" data-testid="button-retry-summary">
              <RefreshCw size={12} /> Activity unavailable
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5"><Check size={12} className="text-[#739484]" /> Messages refresh quietly</span>
          )}
        </footer>
      </div>
    </main>
  );
}

function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string | number; hint: string }) {
  return (
    <div className="flex items-center justify-between rounded-[18px] border border-[#ded9cd] bg-[#fbfaf5] px-3.5 py-3 shadow-[0_4px_15px_rgba(35,56,58,.035)] lg:px-4">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-1.5 text-[#71817e]">{icon}<span className="truncate font-mono text-[8px] uppercase tracking-[.11em] sm:text-[9px]">{label}</span></div>
        <div className="font-serif text-[22px] leading-none tracking-[-.035em] sm:text-[24px]" data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</div>
      </div>
      <span className="hidden max-w-[90px] text-right text-[10px] leading-4 text-[#92958c] lg:block">{hint}</span>
      <span className="ml-1 text-[9px] text-[#92958c] lg:hidden">{label === 'Here lately' ? 'here' : label === 'Messages today' ? 'today' : 'total'}</span>
    </div>
  );
}

function MessageRow({ message, mine, compact }: { message: ChatMessage; mine: boolean; compact: boolean }) {
  return (
    <article className={`message-enter flex gap-3 ${mine ? 'flex-row-reverse' : ''} ${compact ? 'mt-[-9px]' : ''}`} data-testid={`message-${message.id}`}>
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-medium ${mine ? 'bg-[#dcebe6] text-[#426d64]' : 'bg-[#f2ded4] text-[#854b3b]'} ${compact ? 'invisible' : ''}`} aria-hidden="true">{initials(message.authorName)}</div>
      <div className={`flex min-w-0 max-w-[84%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {!compact && (
          <div className={`mb-1.5 flex items-baseline gap-2 px-1 ${mine ? 'flex-row-reverse' : ''}`}>
            <span className="text-[11px] font-semibold text-[#314c50]" data-testid={`message-author-${message.id}`}>{message.authorName}</span>
            <time className="font-mono text-[9px] text-[#a19c8e]" dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          </div>
        )}
        <div className={`whitespace-pre-wrap break-words rounded-[17px] px-4 py-2.5 text-[13px] leading-[1.65] sm:text-[14px] ${mine ? 'rounded-tr-[5px] bg-[#dfece6] text-[#244e48]' : 'rounded-tl-[5px] bg-[#f0eee7] text-[#29454a]'}`} data-testid={`message-content-${message.id}`}>{message.content}</div>
      </div>
    </article>
  );
}

function MessageSkeleton() {
  return (
    <div className="flex-1 space-y-6 px-5 py-8 sm:px-8" aria-label="Loading messages" data-testid="loading-messages">
      <div className="mx-auto max-w-[780px] space-y-6">
        {[0, 1, 2].map((item) => (
          <div key={item} className={`flex gap-3 ${item === 1 ? 'flex-row-reverse' : ''}`}>
            <div className="h-8 w-8 animate-pulse rounded-full bg-[#e9e5da]" />
            <div className={`space-y-2 ${item === 1 ? 'items-end' : ''}`}>
              <div className="h-3 w-24 animate-pulse rounded bg-[#e9e5da]" />
              <div className={`h-12 animate-pulse rounded-2xl bg-[#efede5] ${item === 1 ? 'w-56' : 'w-72'}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
