import { useEffect, useState, FormEvent, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Copy, Users, Eye, RotateCcw, LogOut, EyeOff, Bot, Smile } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { RealtimeChannel } from "@supabase/supabase-js";

interface User {
  id: string;
  name: string;
  vote: string | null;
  isCreator: boolean;
  isSpectator: boolean;
}

interface RoomData {
  id: string;
  name: string;
  users: User[];
  status: "voting" | "revealing" | "revealed";
}

const FIBONACCI = ["0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "?", "☕"];

export default function Room() {
  const { t } = useTranslation();
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [userName, setUserName] = useState(localStorage.getItem("poker_user_name") || "");
  const [isSpectator, setIsSpectator] = useState(localStorage.getItem("poker_is_spectator") === "true");
  const [hasJoined, setHasJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const userNameRef = useRef(userName);
  const isSpectatorRef = useRef(isSpectator);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const voteRef = useRef<string | null>(null);

  const updateRoomFromPresence = useCallback((presenceState: any) => {
    const users: User[] = Object.values(presenceState)
      .flat()
      .map((p: any) => ({
        id: p.presence_ref,
        name: p.name,
        vote: p.vote,
        isCreator: p.isCreator,
        isSpectator: p.isSpectator,
      }));

    setRoom((prev) => {
      if (!prev) return null;
      return { ...prev, users };
    });
  }, []);

  useEffect(() => {
    if (!roomId) return;

    const currentChannel = supabase.channel(`room:${roomId}`, {
      config: {
        presence: {
          key: roomId,
        },
      },
    });

    currentChannel
      .on("presence", { event: "sync" }, () => {
        const state = currentChannel.presenceState();
        const users: User[] = Object.values(state)
          .flat()
          .map((p: any) => ({
            id: p.presence_ref,
            name: p.name,
            vote: p.vote,
            isCreator: p.isCreator,
            isSpectator: p.isSpectator,
          }));

        // Try to recover room name from presence or local storage if possible
        const roomName = users.length > 0 ? (state[roomId]?.[0] as any)?.roomName : (localStorage.getItem(`poker_room_name_${roomId}`) || "Planning Poker");

        setRoom((prev) => ({
          id: roomId,
          name: roomName,
          status: prev?.status || "voting",
          users,
        }));
        setIsLoading(false);
      })
      .on("broadcast", { event: "statusChange" }, ({ payload }) => {
        setRoom((prev) => prev ? { ...prev, status: payload.status } : null);
        if (payload.status === "revealing") {
          startCountdown();
        }
      })
      .on("broadcast", { event: "reset" }, async () => {
        voteRef.current = null;
        setRoom((prev) => prev ? { ...prev, status: "voting" } : null);

        // Each user must reset their own vote in the presence state
        const state = currentChannel.presenceState();
        const isFirst = Object.keys(state).length === 0 || (state[roomId!]?.[0] as any)?.isCreator;
        const roomName = (state[roomId!]?.[0] as any)?.roomName || "Planning Poker";

        await currentChannel.track({
          name: userNameRef.current,
          isSpectator: isSpectatorRef.current,
          isCreator: !!isFirst,
          vote: null,
          roomName,
        });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const savedName = localStorage.getItem("poker_user_name");
          const savedSpectator = localStorage.getItem("poker_is_spectator") === "true";
          if (savedName) {
            joinRoom(savedName, savedSpectator, currentChannel);
          } else {
            setIsLoading(false);
          }
        }
      });

    setChannel(currentChannel);

    return () => {
      currentChannel.unsubscribe();
    };
  }, [roomId]);

  const startCountdown = () => {
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev !== null && prev > 1) return prev - 1;
        clearInterval(interval);
        return null;
      });
    }, 1000);
  };

  const joinRoom = async (name: string, spectator: boolean, activeChannel?: RealtimeChannel) => {
    const targetChannel = activeChannel || channel;
    if (!targetChannel || !roomId) return;

    const state = targetChannel.presenceState();
    const isFirst = Object.keys(state).length === 0;
    const roomName = localStorage.getItem(`poker_room_name_${roomId}`) || "Planning Poker";

    await targetChannel.track({
      name,
      isSpectator: spectator,
      isCreator: isFirst,
      vote: voteRef.current,
      roomName,
    });

    setHasJoined(true);
    userNameRef.current = name;
    isSpectatorRef.current = spectator;
    localStorage.setItem("poker_user_name", name);
    localStorage.setItem("poker_is_spectator", spectator ? "true" : "false");
  };

  const handleJoinSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (userName.trim()) {
      joinRoom(userName, isSpectator);
    }
  };

  const handleVote = async (vote: string) => {
    if (room?.status === "voting" && !isSpectator && channel) {
      const currentUser = room.users.find(u => u.name === userName); // Simplificação, idealmente usar UUID no presence
      await channel.track({
        ...currentUser,
        name: userName,
        isSpectator,
        vote: vote,
        roomName: room.name
      });
      voteRef.current = vote;
    }
  };

  const handleReveal = async () => {
    if (channel) {
      await channel.send({
        type: "broadcast",
        event: "statusChange",
        payload: { status: "revealing" },
      });
      setRoom(prev => prev ? { ...prev, status: "revealing" } : null);
      startCountdown();

      setTimeout(async () => {
        await channel.send({
          type: "broadcast",
          event: "statusChange",
          payload: { status: "revealed" },
        });
        setRoom(prev => prev ? { ...prev, status: "revealed" } : null);
      }, 3000);
    }
  };

  const handleReset = async () => {
    if (channel) {
      await channel.send({
        type: "broadcast",
        event: "reset",
      });

      // Update our own presence to reset vote
      const currentUser = room?.users.find(u => u.name === userName);
      await channel.track({
        ...currentUser,
        name: userName,
        isSpectator,
        vote: null,
        roomName: room?.name
      });

      setRoom(prev => prev ? { ...prev, status: "voting" } : null);
      voteRef.current = null;
    }
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400"></div></div>;
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-12 bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-red-200 dark:border-red-900 text-center transition-colors duration-200">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">{t("room_not_found")}</h2>
        <p className="text-red-500 dark:text-red-400 mb-6">{error}</p>
        <button
          onClick={() => navigate("/")}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-xl transition-colors"
        >
          {t("return_home")}
        </button>
      </div>
    );
  }

  if (!hasJoined) {
    return (
      <div className="max-w-md mx-auto mt-12 bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">{t("join_room")}</h1>
          <p className="text-slate-500 dark:text-slate-400">{room?.name}</p>
        </div>

        <form onSubmit={handleJoinSubmit} className="space-y-6">
          <div>
            <label htmlFor="userName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t("your_name")}
            </label>
            <input
              id="userName"
              type="text"
              required
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              placeholder={t("placeholder_user_name")}
            />
          </div>

          <div className="flex items-center">
            <input
              id="isSpectator"
              type="checkbox"
              checked={isSpectator}
              onChange={(e) => setIsSpectator(e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900"
            />
            <label htmlFor="isSpectator" className="ml-2 block text-sm text-slate-700 dark:text-slate-300">
              {t("join_as_spectator")}
            </label>
          </div>

          <button
            type="submit"
            disabled={!userName.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("enter_room")}
          </button>
        </form>
      </div>
    );
  }

  if (!room) return null;

  const currentUser = room.users.find((u) => u.name === userName);
  const isCreator = currentUser?.isCreator || false;
  const votingUsers = room.users.filter(u => !u.isSpectator);
  const spectatorUsers = room.users.filter(u => u.isSpectator);
  const allVoted = votingUsers.length > 0 && votingUsers.every((u) => u.vote !== null);

  // Calculate average
  let average = 0;
  if (room.status === "revealed") {
    const numericVotes = votingUsers
      .map((u) => u.vote)
      .filter((v) => v !== null && v !== "?" && v !== "☕")
      .map(Number);

    if (numericVotes.length > 0) {
      average = numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length;
    }
  }

  // Calculate vote distribution and agreement
  const voteDistribution = votingUsers.reduce((acc, user) => {
    if (user.vote !== null) {
      acc[user.vote] = (acc[user.vote] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const sortedVotes = Object.keys(voteDistribution).sort((a, b) => {
    const aIdx = FIBONACCI.indexOf(a);
    const bIdx = FIBONACCI.indexOf(b);
    return aIdx - bIdx;
  });

  const voteCountValues = Object.values(voteDistribution) as number[];
  const totalVotesCount = voteCountValues.reduce((sum: number, count: number) => sum + count, 0);
  const maxVoteCount = Math.max(...voteCountValues, 0);
  const agreementPercentage = totalVotesCount > 0 ? (maxVoteCount / totalVotesCount) * 100 : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{room.name}</h1>
          <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400 mt-1">
            <div className="flex items-center gap-1">
              <Users size={16} />
              <span>{votingUsers.length} {votingUsers.length === 1 ? t("player_one") : t("player_other")}</span>
            </div>
            {spectatorUsers.length > 0 && (
              <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
                <Eye size={16} />
                <span>{spectatorUsers.length} {spectatorUsers.length === 1 ? t("spectator_one") : t("spectator_other")}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={copyInviteLink}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium py-2 px-4 rounded-xl transition-colors"
          >
            <Copy size={18} />
            {copied ? t("copied") : t("copy_link")}
          </button>
          <button
            onClick={() => {
              localStorage.removeItem("poker_user_id");
              localStorage.removeItem("poker_user_name");
              localStorage.removeItem("poker_is_spectator");
              window.location.href = "/";
            }}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
            title={t("leave_game")}
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {/* Table Section */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 min-h-[400px] h-full flex flex-col transition-colors duration-200">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t("table")}</h2>
                <div className="flex gap-3">
                  {room.status === "voting" ? (
                    <button
                      onClick={handleReveal}
                      className={clsx(
                        "flex items-center gap-2 font-semibold py-2 px-4 rounded-xl transition-colors",
                        allVoted
                          ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                          : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
                      )}
                    >
                      <Eye size={18} />
                      {t("reveal_cards")}
                    </button>
                  ) : (
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-xl transition-colors"
                    >
                      <RotateCcw size={18} />
                      {t("start_new_voting")}
                    </button>
                  )}
                </div>
            </div>

            {/* Poker Table Visualization */}
            <div className="relative flex items-center justify-center py-12 min-h-[300px]">
              <div className="absolute inset-0 bg-slate-50 dark:bg-slate-900 rounded-full border-4 border-slate-200 dark:border-slate-700 w-full max-w-md md:max-w-2xl lg:max-w-2xl mx-auto aspect-[2/1] sm:aspect-auto sm:h-64 md:h-80 top-1/2 -translate-y-1/2 flex items-center justify-center transition-colors duration-200">
                {room.status === "revealing" && countdown !== null && (
                  <div className="text-center animate-pulse">
                    <div className="text-6xl font-bold text-indigo-600 dark:text-indigo-400">{countdown}</div>
                  </div>
                )}
                {(room.status === "voting" || room.status === "revealed") && (
                  <div className="text-slate-400 dark:text-slate-500 font-medium text-center px-4">
                    {room.status === "voting" ? t("voting_in_progress") : (
                      <div className="flex flex-col items-center">
                        <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{average > 0 ? average.toFixed(1).replace(/\.0$/, '') : "-"}</span>
                        <span className="text-[10px] uppercase tracking-widest">{t("average")}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Users around table */}
              <div className="relative w-full h-full min-h-[300px]">
                {votingUsers.map((user, index) => {
                  const totalUsers = votingUsers.length;
                  const angle = totalUsers > 0 ? (index / totalUsers) * 2 * Math.PI - Math.PI / 2 : 0;
                  const radiusX = 40;
                  const radiusY = 50;

                  const left = `calc(50% + ${Math.cos(angle) * radiusX}%)`;
                  const top = `calc(50% + ${Math.sin(angle) * radiusY}%)`;

                  return (
                    <div
                      key={user.id}
                      className={clsx(
                        "absolute transform -translate-x-1/2 -translate-y-1/2 flex gap-2",
                        // Determine flex direction based on angle to place name outside the table
                        (() => {
                          let normAngle = angle;
                          while (normAngle > Math.PI) normAngle -= 2 * Math.PI;
                          while (normAngle <= -Math.PI) normAngle += 2 * Math.PI;

                          if (normAngle > -Math.PI * 0.75 && normAngle < -Math.PI * 0.25) return "flex-col-reverse items-center"; // Top
                          if (normAngle > Math.PI * 0.25 && normAngle < Math.PI * 0.75) return "flex-col items-center"; // Bottom
                          if (normAngle >= -Math.PI * 0.25 && normAngle <= Math.PI * 0.25) return "flex-row items-center"; // Right
                          return "flex-row-reverse items-center"; // Left
                        })()
                      )}
                      style={{ left, top }}
                    >
                      <div className={clsx(
                        "w-12 h-16 sm:w-16 sm:h-24 rounded-lg border-2 flex items-center justify-center shadow-sm transition-all duration-500",
                        room.status === "revealing" && user.vote
                          ? "bg-indigo-600 border-indigo-700 text-white animate-pulse"
                          : user.vote
                            ? (room.status === "revealed" ? "bg-white dark:bg-slate-800 border-indigo-600 text-indigo-600" : "bg-indigo-600 border-indigo-700 text-white")
                            : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 border-dashed text-slate-400 dark:text-slate-500"
                      )}>
                        {room.status === "revealing" && user.vote ? (
                          <span className="text-2xl">✓</span>
                        ) : room.status === "revealed" ? (
                          <span className="text-2xl font-bold">{user.vote || "?"}</span>
                        ) : user.vote ? (
                          <span className="text-2xl">✓</span>
                        ) : (
                          <span className="text-sm">...</span>
                        )}
                      </div>
                      <div className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[150px] text-center bg-white/80 dark:bg-slate-800/80 px-2 py-1 rounded-md backdrop-blur-sm">
                        {user.name}
                        {user.id === currentUser?.id && ` (${t("you")})`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Results Charts Visualization */}
            {room.status === "revealed" && (
              <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-700 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="w-full flex flex-col md:flex-row items-center justify-around gap-8 md:gap-4">
                  {/* Bar Chart Section */}
                  <div className="flex items-end justify-center gap-4 flex-wrap">
                    {sortedVotes.map((voteValue) => {
                      const count = voteDistribution[voteValue];
                      const heightPercentage = (count / totalVotesCount) * 100;
                      return (
                        <div key={voteValue} className="flex flex-col items-center group">
                          {/* Bar */}
                          <div className="w-3 h-32 bg-slate-100 dark:bg-slate-700/50 rounded-full relative overflow-hidden mb-3">
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-indigo-500 dark:bg-indigo-400 rounded-full transition-all duration-1000 ease-out"
                              style={{ height: `${heightPercentage}%` }}
                            />
                          </div>
                          {/* Card shape */}
                          <div className="w-10 h-14 sm:w-12 sm:h-16 rounded-xl border-2 border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-400 font-bold text-xl shadow-sm mb-2 group-hover:scale-110 transition-transform">
                            {voteValue}
                          </div>
                          {/* Vote count */}
                          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
                            {count} {count === 1 ? t("vote_one") : t("vote_other")}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary Stats Section */}
                  <div className="flex flex-row md:flex-col items-center md:items-start gap-8 md:gap-6 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-700/50 pt-8 md:pt-0 md:pl-8">
                    {/* Average Label */}
                    <div className="text-center md:text-left">
                      <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{t("average")}</div>
                      <div className="text-4xl font-black text-slate-900 dark:text-white leading-none">
                        {average > 0 ? average.toFixed(1).replace(/\.0$/, '') : "-"}
                      </div>
                    </div>

                    {/* Agreement Section */}
                    <div className="text-center md:text-left">
                      <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">{t("agreement")}</div>
                      <div className="relative inline-flex items-center justify-center">
                        {/* Progress circle SVG */}
                        <svg className="w-20 h-20 sm:w-24 sm:h-24 transform -rotate-90" viewBox="0 0 96 96">
                          <circle
                            cx="48"
                            cy="48"
                            r="38"
                            stroke="currentColor"
                            strokeWidth="6"
                            fill="transparent"
                            className="text-slate-100 dark:text-slate-700/50"
                          />
                          <circle
                            cx="48"
                            cy="48"
                            r="38"
                            stroke="currentColor"
                            strokeWidth="6"
                            strokeDasharray={2 * Math.PI * 38}
                            strokeDashoffset={2 * Math.PI * 38 * (1 - agreementPercentage / 100)}
                            strokeLinecap="round"
                            fill="transparent"
                            className={clsx(
                              "transition-all duration-1000 ease-out",
                              agreementPercentage === 100 ? "text-emerald-500" : "text-indigo-500"
                            )}
                          />
                        </svg>
                        {/* Icon in center */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          {agreementPercentage === 100 ? (
                            <Smile className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-500 animate-pulse" />
                          ) : (
                            <Bot className="w-8 h-8 sm:w-10 sm:h-10 text-slate-400" />
                          )}
                        </div>
                      </div>
                      {agreementPercentage === 100 && (
                        <div className="text-[10px] font-black text-emerald-500 uppercase mt-2 tracking-tighter text-center md:text-left">
                          {t("total_coherence")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Spectators List */}
            {spectatorUsers.length > 0 && (
              <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <EyeOff size={14} /> {t("spectators")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {spectatorUsers.map(user => (
                    <div key={user.id} className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-full text-sm font-medium">
                      {user.name} {user.id === currentUser?.id && `(${t("you")})`}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cards Selection Section */}
        {!currentUser?.isSpectator && (
          <div className="w-full">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200">
              <div className="flex flex-col gap-4">
                <h2 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">{t("pick_your_card")}</h2>

                <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                  {FIBONACCI.map((value) => (
                    <button
                      key={value}
                      onClick={() => handleVote(value)}
                      disabled={room.status === "revealed" || room.status === "revealing"}
                      className={clsx(
                        "w-10 sm:w-14 lg:w-16 aspect-[3/4] rounded-xl border-2 flex items-center justify-center text-lg lg:text-2xl font-bold transition-all",
                        (room.status === "revealed" || room.status === "revealing") ? "opacity-50 cursor-not-allowed" : "hover:-translate-y-1 hover:shadow-md",
                        currentUser?.vote === value
                          ? "bg-indigo-600 border-indigo-700 text-white shadow-md -translate-y-1"
                          : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-500"
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
