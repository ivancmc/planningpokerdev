import { useEffect, useState, FormEvent, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Copy, Users, Eye, RotateCcw, LogOut, EyeOff } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

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
      .on("broadcast", { event: "reset" }, () => {
        setRoom((prev) => prev ? { ...prev, status: "voting" } : null);
        // Vote reset is handled by presence update in 'handleReset'
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
  }, [roomId, t]);

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
      vote: null,
      roomName,
    });

    setHasJoined(true);
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Poker Table & Users */}
        <div className={clsx(
          "space-y-6 h-full",
          currentUser?.isSpectator ? "lg:col-span-3" : "lg:col-span-2"
        )}>
          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 min-h-[400px] h-full flex flex-col transition-colors duration-200">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t("table")}</h2>
              {isCreator && (
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
              )}
            </div>

            {/* Poker Table Visualization */}
            <div className="flex-1 relative flex items-center justify-center py-12">
              <div className="absolute inset-0 bg-slate-50 dark:bg-slate-900 rounded-full border-4 border-slate-200 dark:border-slate-700 w-full max-w-md mx-auto aspect-[2/1] sm:aspect-auto sm:h-64 top-1/2 -translate-y-1/2 flex items-center justify-center transition-colors duration-200">
                {room.status === "revealed" && average > 0 && (
                  <div className="text-center">
                    <div className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">{t("average")}</div>
                    <div className="text-5xl font-bold text-indigo-600 dark:text-indigo-400">{average.toFixed(1).replace(/\.0$/, '')}</div>
                  </div>
                )}
                {room.status === "revealing" && countdown !== null && (
                  <div className="text-center animate-pulse">
                    <div className="text-6xl font-bold text-indigo-600 dark:text-indigo-400">{countdown}</div>
                  </div>
                )}
                {room.status === "voting" && (
                  <div className="text-slate-400 dark:text-slate-500 font-medium">
                    {t("voting_in_progress")}
                  </div>
                )}
              </div>

              {/* Users around table */}
              <div className="relative w-full h-full min-h-[300px]">
                {votingUsers.map((user, index) => {
                  const totalUsers = votingUsers.length;
                  // Distribute users in an ellipse
                  const angle = totalUsers > 0 ? (index / totalUsers) * 2 * Math.PI - Math.PI / 2 : 0;
                  const radiusX = 45; // percentage
                  const radiusY = 40; // percentage

                  const left = `calc(50% + ${Math.cos(angle) * radiusX}%)`;
                  const top = `calc(50% + ${Math.sin(angle) * radiusY}%)`;

                  return (
                    <div
                      key={user.id}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2"
                      style={{ left, top }}
                    >
                      <div className={clsx(
                        "w-12 h-16 sm:w-16 sm:h-24 rounded-lg border-2 flex items-center justify-center shadow-sm transition-all duration-500",
                        room.status === "revealed"
                          ? "bg-white dark:bg-slate-800 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-400"
                          : room.status === "revealing" && user.vote
                            ? "bg-indigo-600 border-indigo-700 text-white animate-pulse"
                            : user.vote
                              ? "bg-indigo-600 border-indigo-700 text-white"
                              : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 border-dashed text-slate-400 dark:text-slate-500"
                      )}>
                        {room.status === "revealed" ? (
                          <span className="text-xl sm:text-2xl font-bold">{user.vote || "-"}</span>
                        ) : room.status === "revealing" && user.vote ? (
                          <span className="text-2xl">✓</span>
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

        {/* Right Column: Cards Selection */}
        {!currentUser?.isSpectator && (
          <div className="lg:col-span-1 h-full">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 h-full flex flex-col transition-colors duration-200">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">{t("pick_your_card")}</h2>

              <div className="grid grid-cols-3 gap-3">
                {FIBONACCI.map((value) => (
                  <button
                    key={value}
                    onClick={() => handleVote(value)}
                    disabled={room.status === "revealed" || room.status === "revealing"}
                    className={clsx(
                      "aspect-[3/4] rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all",
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
        )}
      </div>
    </div>
  );
}
