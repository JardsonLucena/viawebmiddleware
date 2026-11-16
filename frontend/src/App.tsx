import {
  Alert,
  AppBar,
  Box,
  Button,
  Checkbox,
  Chip,
  Container,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  FormControlLabel,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography
} from "@mui/material";
import {
  Add,
  CameraAlt,
  Dashboard as DashboardIcon,
  Edit,
  DarkMode,
  DeleteOutline,
  LightMode,
  Link as LinkIcon,
  Lock,
  LockOpen,
  Refresh,
  Sensors,
  Settings
} from "@mui/icons-material";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  AccountUser,
  api,
  Building,
  Camera,
  CentralPartitionCamera,
  CentralPartition,
  CentralZoneCamera,
  CentralZone,
  Dashboard,
  EventRecord
} from "./api";

const emptyDashboard: Dashboard = {
  totalEvents: 0,
  failedEvents: 0,
  successfulEvents: 0,
  averageExecutionMs: 0,
  recentEvents: []
};

declare global {
  interface Window {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
    ISScustomAPI?: {
      onSetup?: (callback: (settings: string) => void) => void;
      sendReact: (type: string, id: string, action: string, params: string) => void;
    };
  }
}

type EventCameraResponse = {
  ok: boolean;
  mediaClientId?: string;
  cameras: string[];
  error?: string;
};

type PartitionStatus = {
  pos: number;
  armado: number;
  disparado: number;
};

type ReceiverCommandResponse = {
  ok: boolean;
  response?: unknown;
};

function createAlarmDataUri() {
  const sampleRate = 8000;
  const durationSeconds = 0.55;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const frequency = time < 0.27 ? 880 : 660;
    const envelope = Math.min(1, index / 120) * Math.min(1, (sampleCount - index) / 240);
    const sample = Math.sin(2 * Math.PI * frequency * time) * 0.65 * envelope;
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return `data:audio/wav;base64,${window.btoa(binary)}`;
}

function normalizeMediaClientId(mediaClientId: string) {
  return mediaClientId.trim().replace(/^MEDIA_CLIENT_/i, "") || "1";
}

function isIntrusionAlarmEvent(event: EventRecord) {
  return event.event_code.trim() === "1130";
}

function sendToSecurosHtml5MediaClient(mediaClientId: string, cameraIds: string[]) {
  if (!window.ISScustomAPI?.sendReact || cameraIds.length === 0) return false;

  const clientId = normalizeMediaClientId(mediaClientId);
  window.ISScustomAPI.sendReact(
    "MEDIA_CLIENT",
    clientId,
    "ADD_SEQUENCE",
    JSON.stringify({ seq: cameraIds.join("|") })
  );

  return true;
}

function isEventHandled(event: EventRecord) {
  return event.status === "ENCERRADO" || Boolean(event.treatments?.some((treatment) => treatment.action === "ENCERRADO"));
}

function needsTreatment(event: EventRecord) {
  return isIntrusionAlarmEvent(event) && !isEventHandled(event);
}

function getReceiverCommandItems(response: unknown) {
  const body = response as { response?: { resposta?: unknown } };
  const receiverResponse = body.response;
  if (!receiverResponse) return [];

  const commandResponse = receiverResponse as { resposta?: unknown };
  if (Array.isArray(commandResponse.resposta)) return commandResponse.resposta;
  if (Array.isArray(receiverResponse)) return receiverResponse;
  return [receiverResponse];
}

function getPartitionStatuses(response: unknown) {
  return getReceiverCommandItems(response)
    .filter((item): item is { cmd: string; pos: number; armado: number; disparado: number } => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as { cmd?: unknown; pos?: unknown; armado?: unknown; disparado?: unknown };
      return candidate.cmd === "particoes" && typeof candidate.pos === "number";
    })
    .map((item) => ({
      pos: item.pos,
      armado: Number(item.armado ?? 0),
      disparado: Number(item.disparado ?? 0)
    }));
}

const treatmentActions = {
  RECONHECIDO: "Reconhecer",
  NOTA: "Registrar observação",
  ACIONOU_RONDA: "Registrar acionamento da ronda",
  ACIONOU_POLICIA: "Registrar acionamento da polícia",
  ALARME_REAL: "Encerrar como alarme real",
  FALSO_ALARME: "Encerrar como falso alarme",
  ENCERRADO: "Encerrar ocorrência"
};

function App({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const isOperatorRoute = window.location.pathname.startsWith("/operador");
  const [tab, setTab] = useState(0);
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [centralPartitions, setCentralPartitions] = useState<CentralPartition[]>([]);
  const [centralZones, setCentralZones] = useState<CentralZone[]>([]);
  const [partitionCameras, setPartitionCameras] = useState<CentralPartitionCamera[]>([]);
  const [zoneCameras, setZoneCameras] = useState<CentralZoneCamera[]>([]);
  const [viawebStatus, setViawebStatus] = useState<Record<string, unknown> | null>(null);
  const [html5MediaClientId, setHtml5MediaClientId] = useState(() => localStorage.getItem("html5MediaClientId") ?? "1");
  const [issSetup, setIssSetup] = useState<Record<string, unknown> | null>(null);
  const [statusesByIsep, setStatusesByIsep] = useState<Record<string, PartitionStatus[]>>({});
  const [updatedAtByIsep, setUpdatedAtByIsep] = useState<Record<string, string>>({});
  const [centralStatusLoading, setCentralStatusLoading] = useState("");
  const [centralStatusMessage, setCentralStatusMessage] = useState("");
  const [centralAutoRefresh, setCentralAutoRefresh] = useState(true);
  const centralRefreshRunning = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const [alarmSoundEnabled, setAlarmSoundEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [live, setLive] = useState(false);
  const [treatmentId, setTreatmentId] = useState<number | null>(null);
  const treatmentEvent = events.find((event) => event.id === treatmentId);

  const refreshAll = async () => {
    const [
      dashboardRes,
      camerasRes,
      eventsRes,
      usersRes,
      buildingsRes,
      partitionsRes,
      zonesRes,
      partitionCamerasRes,
      zoneCamerasRes,
      viawebRes
    ] = await Promise.all([
      api.get<Dashboard>("/dashboard"),
      api.get<Camera[]>("/cameras"),
      api.get<EventRecord[]>("/events"),
      api.get<AccountUser[]>("/users"),
      api.get<Building[]>("/buildings"),
      api.get<CentralPartition[]>("/central-partitions"),
      api.get<CentralZone[]>("/central-zones"),
      api.get<CentralPartitionCamera[]>("/central-camera-mappings/partition"),
      api.get<CentralZoneCamera[]>("/central-camera-mappings/zone"),
      api.get<Record<string, unknown>>("/viaweb/status")
    ]);

    setDashboard(dashboardRes.data);
    setCameras(camerasRes.data);
    setEvents(eventsRes.data);
    setUsers(usersRes.data);
    setBuildings(buildingsRes.data);
    setCentralPartitions(partitionsRes.data);
    setCentralZones(zonesRes.data);
    setPartitionCameras(partitionCamerasRes.data);
    setZoneCameras(zoneCamerasRes.data);
    setViawebStatus(viawebRes.data);
  };

  useEffect(() => {
    refreshAll().catch((error) => setNotice(error.message));
    const socket = io();
    socket.on("connect", () => {
      setLive(true);
      refreshAll().catch((error) => setNotice(error.message));
    });
    socket.on("disconnect", () => setLive(false));
    const statusTimer = window.setInterval(() => {
      api.get<Record<string, unknown>>("/viaweb/status", { timeout: 5000 })
        .then(({ data }) => setViawebStatus(data))
        .catch(() => setViawebStatus(null));
    }, 10000);
    socket.on("event:created", (event: EventRecord) => {
      if (isOperatorRoute && isIntrusionAlarmEvent(event)) {
        playAlarmSound().then((played) => {
          if (!played) setNotice("Evento recebido, mas o HTML5 bloqueou o alerta sonoro. Clique em Ativar som novamente.");
        });
      }
      refreshAll().catch((error) => setNotice(error.message));
    });
    socket.on("event:updated", () => refreshAll().catch((error) => setNotice(error.message)));
    return () => {
      window.clearInterval(statusTimer);
      socket.disconnect();
    };
  }, []);

  const playAlarmSound = async () => {
    let played = false;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (AudioContextClass) {
      const audioContext = audioContextRef.current;
      if (audioContext) {
        if (audioContext.state === "suspended") await audioContext.resume();
        if (audioContext.state !== "suspended") {
          for (let index = 0; index < 3; index += 1) {
            const start = audioContext.currentTime + index * 0.62;
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.type = "square";
            oscillator.frequency.setValueAtTime(880, start);
            oscillator.frequency.setValueAtTime(660, start + 0.18);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start(start);
            oscillator.stop(start + 0.45);
          }
          played = true;
        }
      }
    }

    const alarmAudio = alarmAudioRef.current;
    if (alarmAudio) {
      try {
        alarmAudio.currentTime = 0;
        const result = alarmAudio.play();
        if (result) await result;
        played = true;
      } catch {
        // Web Audio above may still have succeeded; the caller shows a visible notice if both paths fail.
      }
    }

    return played;
  };

  const enableAlarmSound = async () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass && typeof Audio === "undefined") {
      setNotice("Este navegador nao suporta alerta sonoro.");
      return;
    }

    if (AudioContextClass) {
      const audioContext = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = audioContext;
      await audioContext.resume();
    }

    if (!alarmAudioRef.current && typeof Audio !== "undefined") {
      alarmAudioRef.current = new Audio(createAlarmDataUri());
      alarmAudioRef.current.preload = "auto";
      alarmAudioRef.current.volume = 1;
    }

    setAlarmSoundEnabled(true);
    setNotice("Alerta sonoro do operador ativado. O audio toca somente em disparo de intrusao.");
  };

  useEffect(() => {
    window.ISScustomAPI?.onSetup?.((settings) => {
      try {
        const parsedSettings = JSON.parse(settings) as Record<string, unknown>;
        setIssSetup(parsedSettings);
        const mediaClientId = String(parsedSettings.media_client_id ?? "");
        if (mediaClientId) {
          setHtml5MediaClientId(mediaClientId);
          localStorage.setItem("html5MediaClientId", mediaClientId);
        }
      } catch (error) {
        setNotice(`Falha ao ler settings do ISScustomAPI: ${String(error)}`);
      }
    });
  }, []);

  const receiverCommand = async (isep: string, command: Record<string, unknown>, registeredOnly = false) => {
    const response = await api.post<ReceiverCommandResponse>("/receiver/command", {
      isepId: isep,
      command,
      registeredOnly
    });
    return response.data;
  };

  const refreshCentralStatus = async (isep: string, silent = false) => {
    if (!silent) setCentralStatusLoading(isep);
    try {
      const response = await receiverCommand(isep, { cmd: "particoes" }, true);
      const statuses = getPartitionStatuses(response);
      setStatusesByIsep((current) => ({ ...current, [isep]: statuses }));
      setUpdatedAtByIsep((current) => ({ ...current, [isep]: new Date().toISOString() }));
      if (!silent) {
        setCentralStatusMessage(statuses.length > 0 ? `Status atualizado da central ${isep}.` : `Central ${isep} nao retornou particoes.`);
      }
    } catch (error) {
      if (!silent) setCentralStatusMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (!silent) setCentralStatusLoading("");
    }
  };

  const refreshAllCentralStatuses = async (silent = false) => {
    if (centralRefreshRunning.current) return;
    centralRefreshRunning.current = true;
    if (!silent) setCentralStatusMessage("Atualizando centrais...");

    try {
      const { data: registeredCentrais } = await api.get<Building[]>("/buildings");
      setBuildings(registeredCentrais);
      for (const central of registeredCentrais) {
        setCentralStatusLoading(central.isep);
        await refreshCentralStatus(central.isep, true);
      }
      if (!silent) setCentralStatusMessage("Centrais atualizadas.");
    } finally {
      setCentralStatusLoading("");
      centralRefreshRunning.current = false;
    }
  };

  const sendCentralPartitionCommand = async (isep: string, cmd: "armar" | "desarmar", partition: number) => {
    const password = localStorage.getItem(`centralCommandPassword:${isep}`);
    if (!password) {
      setCentralStatusMessage(`Cadastre a senha de controle remoto da central ${isep} na aba Clientes.`);
      return;
    }
    setCentralStatusLoading(isep);
    try {
      await receiverCommand(isep, {
        cmd,
        password,
        particoes: [partition]
      });
      setCentralStatusMessage(`${cmd === "armar" ? "Arme" : "Desarme"} enviado para ${isep} / P${partition}.`);
      window.setTimeout(() => {
        refreshCentralStatus(isep).catch((error) => setCentralStatusMessage(error.message));
      }, 1800);
    } catch (error) {
      setCentralStatusMessage(error instanceof Error ? error.message : String(error));
      setCentralStatusLoading("");
    }
  };

  useEffect(() => {
    refreshAllCentralStatuses(true).catch((error) => setCentralStatusMessage(error.message));
  }, [buildings.map((building) => building.isep).join("|")]);

  useEffect(() => {
    if (!centralAutoRefresh) return;
    const timer = window.setInterval(() => {
      refreshAllCentralStatuses(true).catch((error) => setCentralStatusMessage(error.message));
    }, 60000);
    return () => window.clearInterval(timer);
  }, [centralAutoRefresh, buildings.map((building) => building.isep).join("|")]);

  const showEventCameras = async (eventId: number) => {
    try {
      const { data } = await api.get<EventCameraResponse>(`/events/${eventId}/cameras`);
      const cameraIds = data.cameras;
      if (!cameraIds.length) {
        setNotice("Nenhuma câmera vinculada a esta ocorrência.");
        return;
      }
      if (!sendToSecurosHtml5MediaClient(html5MediaClientId, cameraIds)) {
        setNotice("Abra a interface no HTML5 vinculado ao Media Client para mostrar as câmeras.");
        return;
      }
      await api.post(`/events/${eventId}/treatments`, {
        action: "CAMERA_ABERTA",
        operator_name: "Operador",
        note: `Comando de exibição enviado para as câmeras ${cameraIds.join(", ")}`
      });
      setNotice(`ISScustomAPI enviou ADD_SEQUENCE para Media Client ${normalizeMediaClientId(html5MediaClientId)}: ${cameraIds.join(", ")}`);
    } catch (error) {
      setNotice(`Falha na operação de câmera: ${String(error)}`);
    }
  };

  const handleEvent = async (eventId: number) => {
    setTreatmentId(eventId);
  };

  const selectedPanel = useMemo(() => {
    if (isOperatorRoute) {
      return (
        <OperatorView
          dashboard={dashboard}
          events={events}
          buildings={buildings}
          centralPartitions={centralPartitions}
          statusesByIsep={statusesByIsep}
          updatedAtByIsep={updatedAtByIsep}
          loadingIsep={centralStatusLoading}
          statusMessage={centralStatusMessage}
          autoRefresh={centralAutoRefresh}
          mediaClientId={html5MediaClientId}
          alarmSoundEnabled={alarmSoundEnabled}
          onRefreshCentral={refreshCentralStatus}
          onRefreshAllCentals={refreshAllCentralStatuses}
          onToggleAutoRefresh={() => setCentralAutoRefresh((value) => !value)}
          onPartitionCommand={sendCentralPartitionCommand}
          onEnableAlarmSound={enableAlarmSound}
          onRefresh={refreshAll}
          onShowEvent={showEventCameras}
          onHandleEvent={handleEvent}
        />
      );
    }

    if (tab === 0) {
      return (
        <DashboardView
          dashboard={dashboard}
          events={events}
          buildings={buildings}
          centralPartitions={centralPartitions}
          statusesByIsep={statusesByIsep}
          updatedAtByIsep={updatedAtByIsep}
          loadingIsep={centralStatusLoading}
          statusMessage={centralStatusMessage}
          autoRefresh={centralAutoRefresh}
          mediaClientId={html5MediaClientId}
          onRefreshCentral={refreshCentralStatus}
          onRefreshAllCentals={refreshAllCentralStatuses}
          onToggleAutoRefresh={() => setCentralAutoRefresh((value) => !value)}
          onPartitionCommand={sendCentralPartitionCommand}
          onShowEvent={showEventCameras}
          onHandleEvent={handleEvent}
        />
      );
    }
    if (tab === 1) {
      return (
        <ClientsView
          cameras={cameras}
          users={users}
          buildings={buildings}
          centralPartitions={centralPartitions}
          centralZones={centralZones}
          partitionCameras={partitionCameras}
          zoneCameras={zoneCameras}
          statusesByIsep={statusesByIsep}
          updatedAtByIsep={updatedAtByIsep}
          loadingIsep={centralStatusLoading}
          statusMessage={centralStatusMessage}
          onRefreshCentral={refreshCentralStatus}
          onPartitionCommand={sendCentralPartitionCommand}
          onChanged={refreshAll}
        />
      );
    }
    if (tab === 2) return <CamerasView cameras={cameras} onChanged={refreshAll} />;
    return (
      <ConfigView
        viawebStatus={viawebStatus}
        html5MediaClientId={html5MediaClientId}
        issSetup={issSetup}
        onHtml5MediaClientIdChange={(value) => {
          setHtml5MediaClientId(value);
          localStorage.setItem("html5MediaClientId", value);
        }}
      />
    );
  }, [
    tab,
    isOperatorRoute,
    dashboard,
    events,
    cameras,
    users,
    buildings,
    centralPartitions,
    centralZones,
    partitionCameras,
    zoneCameras,
    viawebStatus,
    html5MediaClientId,
    statusesByIsep,
    updatedAtByIsep,
    centralStatusLoading,
    centralStatusMessage,
    centralAutoRefresh,
    alarmSoundEnabled
  ]);

  return (
    <Box className="page-shell" data-theme={dark ? "dark" : "light"}>
      <AppBar position="static" color="inherit" elevation={0}>
        <Toolbar sx={{ gap: 1, flexWrap: "wrap", py: 1, borderBottom: 1, borderColor: "divider" }}>
          <DashboardIcon color="primary" />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">{isOperatorRoute ? "Viaweb Show Cam - Operador" : "Viaweb Show Cam"}</Typography>
            <Typography variant="body2" color="text.secondary">
              {isOperatorRoute ? "Fila de atendimento de eventos Viaweb" : "Middleware operacional para eventos Viaweb e ISS SecurOS"}
            </Typography>
          </Box>
          {isOperatorRoute ? (
            <Button
              variant={alarmSoundEnabled ? "contained" : "outlined"}
              onClick={() => enableAlarmSound().catch((error) => setNotice(error.message))}
            >
              Som {alarmSoundEnabled ? "ativo" : "ativar"}
            </Button>
          ) : null}
          <Tooltip title={dark ? "Tema claro" : "Tema escuro"}>
            <IconButton aria-label={dark ? "Tema claro" : "Tema escuro"} onClick={onToggleTheme}>
              {dark ? <LightMode /> : <DarkMode />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Atualizar dados">
            <IconButton onClick={() => refreshAll().catch((error) => setNotice(error.message))}>
              <Refresh />
            </IconButton>
          </Tooltip>
        </Toolbar>
        {!isOperatorRoute ? (
          <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto">
            <Tab icon={<DashboardIcon />} iconPosition="start" label="Dashboard" />
            <Tab icon={<Sensors />} iconPosition="start" label="Clientes" />
            <Tab icon={<CameraAlt />} iconPosition="start" label="Cameras" />
            <Tab icon={<Settings />} iconPosition="start" label="Configuracao" />
          </Tabs>
        ) : null}
      </AppBar>
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} sx={{ mb: 2 }}>
          <Chip size="small" color={live ? "success" : "warning"} label={live ? "Eventos ao vivo" : "Eventos ao vivo indisponíveis"} />
          <Chip size="small" color={viawebStatus?.connected ? "success" : "warning"} label={viawebStatus?.connected ? "Receiver conectado" : viawebStatus ? "Receiver desconectado" : "Receiver sem status"} />
          <Chip size="small" variant="outlined" label={issSetup ? `Media Client ${normalizeMediaClientId(html5MediaClientId)} vinculado` : "Vínculo SecurOS não confirmado"} />
        </Stack>
        {notice && (
          <Alert severity="warning" onClose={() => setNotice("")} sx={{ mb: 2 }}>
            {notice}
          </Alert>
        )}
        {selectedPanel}
      </Container>
      {treatmentEvent && (
        <TreatmentDialog key={treatmentEvent.id} event={treatmentEvent}
          onClose={() => setTreatmentId(null)}
          onShowCamera={() => showEventCameras(treatmentEvent.id)}
          onSave={async (action, note) => {
            const { data } = await api.post<EventRecord>(`/events/${treatmentEvent.id}/treatments`, { action, note });
            setEvents((current) => current.map((event) => event.id === data.id ? data : event));
            if (!needsTreatment(data)) setTreatmentId(null);
          }}
        />
      )}
    </Box>
  );
}

function DashboardView({
  dashboard,
  events,
  buildings,
  centralPartitions,
  statusesByIsep,
  updatedAtByIsep,
  loadingIsep,
  statusMessage,
  autoRefresh,
  mediaClientId,
  onRefreshCentral,
  onRefreshAllCentals,
  onToggleAutoRefresh,
  onPartitionCommand,
  onShowEvent,
  onHandleEvent
}: {
  dashboard: Dashboard;
  events: EventRecord[];
  buildings: Building[];
  centralPartitions: CentralPartition[];
  statusesByIsep: Record<string, PartitionStatus[]>;
  updatedAtByIsep: Record<string, string>;
  loadingIsep: string;
  statusMessage: string;
  autoRefresh: boolean;
  mediaClientId: string;
  onRefreshCentral: (isep: string, silent?: boolean) => Promise<void>;
  onRefreshAllCentals: (silent?: boolean) => Promise<void>;
  onToggleAutoRefresh: () => void;
  onPartitionCommand: (isep: string, cmd: "armar" | "desarmar", partition: number) => Promise<void>;
  onShowEvent: (eventId: number) => Promise<void>;
  onHandleEvent: (eventId: number) => Promise<void>;
}) {
  const [dashboardTab, setDashboardTab] = useState(0);
  const [queueTab, setQueueTab] = useState(0);
  const pendingEvents = events.filter(needsTreatment);
  const handledEvents = events.filter((event) => !needsTreatment(event));
  const stats = [
    ["Na fila", pendingEvents.length],
    ["Historico", handledEvents.length],
    ["Show Cam OK", dashboard.successfulEvents],
    ["Tempo medio", `${dashboard.averageExecutionMs} ms`]
  ];

  return (
    <Grid container spacing={2}>
      {stats.map(([label, value]) => (
        <Grid item xs={12} sm={6} md={3} key={label}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">{label}</Typography>
            <Typography variant="h4">{value}</Typography>
          </Paper>
        </Grid>
      ))}
      <Grid item xs={12}>
        <Paper sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h6">{dashboardTab === 0 ? "Fila de eventos" : "Centrais registradas"}</Typography>
            <Chip label={`Media Client HTML5 ${normalizeMediaClientId(mediaClientId)}`} />
          </Stack>
          <Tabs value={dashboardTab} onChange={(_, value) => setDashboardTab(value)} sx={{ mb: 2 }}>
            <Tab label="Eventos" />
            <Tab label={`Centrais (${buildings.length})`} />
          </Tabs>
          {dashboardTab === 0 ? (
            <>
              <Tabs value={queueTab} onChange={(_, value) => setQueueTab(value)} sx={{ mb: 1 }}>
                <Tab label={`Pendentes (${pendingEvents.length})`} />
                <Tab label={`Historico (${handledEvents.length})`} />
              </Tabs>
              <EventList
                events={queueTab === 0 ? pendingEvents : handledEvents}
                history={queueTab === 1}
                onShowEvent={onShowEvent}
                onHandleEvent={onHandleEvent}
              />
            </>
          ) : (
            <CentralCardsView
              buildings={buildings}
              centralPartitions={centralPartitions}
              statusesByIsep={statusesByIsep}
              updatedAtByIsep={updatedAtByIsep}
              loadingIsep={loadingIsep}
              statusMessage={statusMessage}
              autoRefresh={autoRefresh}
              onRefreshCentral={onRefreshCentral}
              onRefreshAllCentals={onRefreshAllCentals}
              onToggleAutoRefresh={onToggleAutoRefresh}
              onPartitionCommand={onPartitionCommand}
            />
          )}
        </Paper>
      </Grid>
    </Grid>
  );
}

function OperatorView({
  dashboard,
  events,
  buildings,
  centralPartitions,
  statusesByIsep,
  updatedAtByIsep,
  loadingIsep,
  statusMessage,
  autoRefresh,
  mediaClientId,
  alarmSoundEnabled,
  onRefreshCentral,
  onRefreshAllCentals,
  onToggleAutoRefresh,
  onPartitionCommand,
  onEnableAlarmSound,
  onRefresh,
  onShowEvent,
  onHandleEvent
}: {
  dashboard: Dashboard;
  events: EventRecord[];
  buildings: Building[];
  centralPartitions: CentralPartition[];
  statusesByIsep: Record<string, PartitionStatus[]>;
  updatedAtByIsep: Record<string, string>;
  loadingIsep: string;
  statusMessage: string;
  autoRefresh: boolean;
  mediaClientId: string;
  alarmSoundEnabled: boolean;
  onRefreshCentral: (isep: string, silent?: boolean) => Promise<void>;
  onRefreshAllCentals: (silent?: boolean) => Promise<void>;
  onToggleAutoRefresh: () => void;
  onPartitionCommand: (isep: string, cmd: "armar" | "desarmar", partition: number) => Promise<void>;
  onEnableAlarmSound: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onShowEvent: (eventId: number) => Promise<void>;
  onHandleEvent: (eventId: number) => Promise<void>;
}) {
  const [operatorTab, setOperatorTab] = useState(0);
  const [queueTab, setQueueTab] = useState(0);
  const pendingEvents = events.filter(needsTreatment);
  const handledEvents = events.filter((event) => !needsTreatment(event));
  const oldestPending = pendingEvents.reduce<EventRecord | undefined>((oldest, event) =>
    !oldest || Date.parse(event.received_at) < Date.parse(oldest.received_at) ? event : oldest, undefined);

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h5">Fila do operador</Typography>
            <Typography color="text.secondary">
              Atendimento de alarmes em tempo real. Media Client HTML5 {normalizeMediaClientId(mediaClientId)}.
            </Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button variant={alarmSoundEnabled ? "contained" : "outlined"} onClick={() => onEnableAlarmSound()}>
              {alarmSoundEnabled ? "Som ativo" : "Ativar som"}
            </Button>
            <Button variant="outlined" startIcon={<Refresh />} onClick={() => onRefresh()}>
              Atualizar
            </Button>
          </Stack>
        </Stack>
        {!alarmSoundEnabled ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Clique em Ativar som ao abrir a tela. O navegador exige essa confirmacao para tocar alerta quando chegar evento.
          </Alert>
        ) : null}
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">Pendentes</Typography>
            <Typography variant="h4">{pendingEvents.length}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">Historico</Typography>
            <Typography variant="h4">{handledEvents.length}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">Show Cam OK</Typography>
            <Typography variant="h4">{dashboard.successfulEvents}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">Mais antigo</Typography>
            <Typography variant="h6">{oldestPending ? formatDate(oldestPending.received_at) : "-"}</Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }}>
        <Tabs value={operatorTab} onChange={(_, value) => setOperatorTab(value)} sx={{ mb: 2 }}>
          <Tab label={`Eventos (${pendingEvents.length})`} />
          <Tab label={`Centrais (${buildings.length})`} />
        </Tabs>
        {operatorTab === 0 ? (
          <>
            <Tabs value={queueTab} onChange={(_, value) => setQueueTab(value)} sx={{ mb: 1 }}>
              <Tab label={`Pendentes (${pendingEvents.length})`} />
              <Tab label={`Historico (${handledEvents.length})`} />
            </Tabs>
            <EventList
              events={queueTab === 0 ? pendingEvents : handledEvents}
              history={queueTab === 1}
              onShowEvent={onShowEvent}
              onHandleEvent={onHandleEvent}
            />
          </>
        ) : (
          <CentralCardsView
            buildings={buildings}
            centralPartitions={centralPartitions}
            statusesByIsep={statusesByIsep}
            updatedAtByIsep={updatedAtByIsep}
            loadingIsep={loadingIsep}
            statusMessage={statusMessage}
            autoRefresh={autoRefresh}
            onRefreshCentral={onRefreshCentral}
            onRefreshAllCentals={onRefreshAllCentals}
            onToggleAutoRefresh={onToggleAutoRefresh}
            onPartitionCommand={onPartitionCommand}
          />
        )}
      </Paper>
    </Stack>
  );
}

function CentralCardsView({
  buildings,
  centralPartitions,
  statusesByIsep,
  updatedAtByIsep,
  loadingIsep,
  statusMessage,
  autoRefresh,
  onRefreshCentral,
  onRefreshAllCentals,
  onToggleAutoRefresh,
  onPartitionCommand
}: {
  buildings: Building[];
  centralPartitions: CentralPartition[];
  statusesByIsep: Record<string, PartitionStatus[]>;
  updatedAtByIsep: Record<string, string>;
  loadingIsep: string;
  statusMessage: string;
  autoRefresh: boolean;
  onRefreshCentral: (isep: string, silent?: boolean) => Promise<void>;
  onRefreshAllCentals: (silent?: boolean) => Promise<void>;
  onToggleAutoRefresh: () => void;
  onPartitionCommand: (isep: string, cmd: "armar" | "desarmar", partition: number) => Promise<void>;
}) {
  if (buildings.length === 0) return <Typography color="text.secondary">Nenhuma central cadastrada.</Typography>;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }} spacing={1}>
        {statusMessage ? <Alert severity="info" sx={{ flexGrow: 1 }}>{statusMessage}</Alert> : <Typography color="text.secondary">Consulta automatica a cada 60 segundos.</Typography>}
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" onClick={() => onRefreshAllCentals(false)}>
            Atualizar todas
          </Button>
          <Button size="small" variant={autoRefresh ? "contained" : "outlined"} onClick={onToggleAutoRefresh}>
            Auto {autoRefresh ? "ligado" : "desligado"}
          </Button>
        </Stack>
      </Stack>
      <Grid container spacing={2}>
        {buildings.map((central) => {
          const statuses = statusesByIsep[central.isep] ?? [];
          const partitions = visibleCentralPartitions(central.isep, centralPartitions, statuses);

          return (
            <Grid item xs={12} sm={6} lg={4} key={central.id}>
              <Paper className="central-card" elevation={0}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                  <Box>
                    <Typography variant="h6">{central.building_name}</Typography>
                    <Typography variant="body2" color="text.secondary">ISEP {central.isep}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Ultima consulta: {formatDate(updatedAtByIsep[central.isep])}
                    </Typography>
                  </Box>
                  <Button size="small" variant="text" disabled={loadingIsep === central.isep} onClick={() => onRefreshCentral(central.isep)}>
                    Atualizar
                  </Button>
                </Stack>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
                  {partitions.map((partition) => {
                    const status = statuses.find((item) => item.pos === partition.partition);
                    return (
                      <Box
                        key={partition.partition}
                        className={`partition-pill ${partitionStatusClass(status)}`}
                      >
                        <Box>
                          <Typography variant="subtitle2">P{partition.partition}</Typography>
                          <Typography variant="caption">{partition.name}</Typography>
                          <Typography variant="body2">{partitionStatusLabel(status)}</Typography>
                        </Box>
                        <Stack className="partition-actions" spacing={0.75}>
                          <Button size="small" variant="contained" startIcon={<Lock />} onClick={() => onPartitionCommand(central.isep, "armar", partition.partition)}>
                            Armar
                          </Button>
                          <Button size="small" variant="outlined" startIcon={<LockOpen />} onClick={() => onPartitionCommand(central.isep, "desarmar", partition.partition)}>
                            Desarmar
                          </Button>
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </Stack>
  );
}

function TreatmentDialog({ event, onClose, onShowCamera, onSave }: {
  event: EventRecord;
  onClose: () => void;
  onShowCamera: () => Promise<void>;
  onSave: (action: string, note: string) => Promise<void>;
}) {
  const [action, setAction] = useState(event.status === "EM_TRATATIVA" ? "NOTA" : "RECONHECIDO");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const readOnly = !needsTreatment(event);
  const submit = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (saving || readOnly || (action !== "RECONHECIDO" && !note.trim())) return;
    setSaving(true);
    setError("");
    try {
      await onSave(action, note.trim());
      setNote("");
      if (action === "RECONHECIDO") setAction("NOTA");
    }
    catch {
      setError("Falha ao registrar a tratativa. Confira o histórico antes de tentar novamente.");
    }
    finally { setSaving(false); }
  };
  return (
    <Dialog open fullWidth maxWidth="sm" onClose={saving ? undefined : onClose}>
      <form onSubmit={submit}>
        <DialogTitle>Ocorrência #{event.id}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography>{event.payload?.interpretation?.origin ?? event.account} · {event.payload?.interpretation?.display ?? event.event_code}</Typography>
            <Typography variant="body2" color="text.secondary">{formatDate(event.received_at)} · P{event.partition} / Z{event.zone}</Typography>
            <Chip size="small" sx={{ alignSelf: "flex-start" }} label={readOnly ? "Histórico" : event.status === "EM_TRATATIVA" ? "Em tratativa" : "Intrusão pendente"} />
            {error && <Alert severity="error">{error}</Alert>}
            {!readOnly && <>
              <TextField select SelectProps={{ native: true }} label="Ação" value={action} onChange={(e) => setAction(e.target.value)} disabled={saving}>
                {Object.entries(treatmentActions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </TextField>
              <TextField label="Observação" multiline minRows={3} value={note} onChange={(e) => setNote(e.target.value)} required={action !== "RECONHECIDO"} disabled={saving} />
            </>}
            <Typography variant="subtitle2">Histórico de atividades</Typography>
            {(event.treatments ?? []).map((entry) => (
              <Box key={entry.id}>
                <Typography variant="body2">{treatmentActions[entry.action as keyof typeof treatmentActions] ?? entry.action}</Typography>
                <Typography variant="caption" color="text.secondary">{formatDate(entry.created_at)} · {entry.operator_name ?? "Operador"}</Typography>
                {entry.note && <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{entry.note}</Typography>}
              </Box>
            ))}
            {!event.treatments?.length && <Typography color="text.secondary">Nenhuma atividade registrada.</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap" }}>
          <Button startIcon={<CameraAlt />} onClick={onShowCamera}>Mostrar câmeras</Button>
          <Button onClick={onClose} disabled={saving}>Fechar</Button>
          {!readOnly && <Button type="submit" variant="contained" disabled={saving}>{treatmentActions[action as keyof typeof treatmentActions]}</Button>}
        </DialogActions>
      </form>
    </Dialog>
  );
}

function EventList({
  events,
  history = false,
  onShowEvent,
  onHandleEvent
}: {
  events: EventRecord[];
  history?: boolean;
  onShowEvent: (eventId: number) => Promise<void>;
  onHandleEvent: (eventId: number) => Promise<void>;
}) {
  if (events.length === 0) return <Typography color="text.secondary">{history ? "Nenhum evento tratado." : "Nenhum evento pendente."}</Typography>;

  const ordered = history ? events : [...events].sort((a, b) =>
    Number(isIntrusionAlarmEvent(b)) - Number(isIntrusionAlarmEvent(a)) ||
    Date.parse(a.received_at) - Date.parse(b.received_at) || a.id - b.id
  );
  return (
    <List dense>
      {ordered.map((event) => (
        <ListItem key={event.id} divider sx={{ flexWrap: "wrap", gap: 1, py: 1 }}>
          <Box sx={{ mr: 1.5 }} className={`status-dot ${eventListStatusClass(event)}`} />
          <ListItemText
            primary={`${event.payload?.interpretation?.origin ?? event.payload?.interpretation?.accountName ?? event.account} - ${event.payload?.interpretation?.display ?? event.event_code}`}
            secondary={
              history
                ? `${new Date(event.received_at).toLocaleString()} - ${lastTreatmentSummary(event)}`
                : `${new Date(event.received_at).toLocaleString()} - ISEP ${event.payload?.interpretation?.isep ?? "-"} / conta ${event.account} / P${event.partition} / zona-usuario ${event.zone} - ${event.status} - ${event.execution_ms ?? 0} ms`
            }
          />
          <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5}>
            {isIntrusionAlarmEvent(event) && <Chip size="small" color="error" label="Intrusão" />}
            {event.status === "EM_TRATATIVA" && <Chip size="small" color="info" label="Em tratativa" />}
            <Button size="small" variant="outlined" onClick={() => onShowEvent(event.id)}>
              Mostrar
            </Button>
              <Button size="small" variant={history ? "outlined" : "contained"} onClick={() => onHandleEvent(event.id)}>
                {history ? "Detalhes" : "Tratar"}
              </Button>
            {event.cameras_sent.map((cameraId) => (
              <Chip key={cameraId} size="small" label={cameraId} />
            ))}
          </Stack>
        </ListItem>
      ))}
    </List>
  );
}

function ClientsView({
  cameras,
  users,
  buildings,
  centralPartitions,
  centralZones,
  partitionCameras,
  zoneCameras,
  statusesByIsep,
  updatedAtByIsep,
  loadingIsep,
  statusMessage,
  onRefreshCentral,
  onPartitionCommand,
  onChanged
}: {
  cameras: Camera[];
  users: AccountUser[];
  buildings: Building[];
  centralPartitions: CentralPartition[];
  centralZones: CentralZone[];
  partitionCameras: CentralPartitionCamera[];
  zoneCameras: CentralZoneCamera[];
  statusesByIsep: Record<string, PartitionStatus[]>;
  updatedAtByIsep: Record<string, string>;
  loadingIsep: string;
  statusMessage: string;
  onRefreshCentral: (isep: string, silent?: boolean) => Promise<void>;
  onPartitionCommand: (isep: string, cmd: "armar" | "desarmar", partition: number) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const [selectedIsep, setSelectedIsep] = useState("");
  const [userForm, setUserForm] = useState({ partition: "1", user_number: "", user_name: "", description: "" });
  const [centralForm, setCentralForm] = useState({ isep: "", building_name: "", description: "" });
  const [partitionForm, setPartitionForm] = useState({ partition: "", partition_name: "", description: "" });
  const [zoneForm, setZoneForm] = useState({ partition: "", zone: "", zone_name: "", description: "" });
  const [partitionCameraForm, setPartitionCameraForm] = useState({ partition: "", camera_ids: "" });
  const [zoneCameraForm, setZoneCameraForm] = useState({ partition: "", zone: "", camera_ids: "" });
  const [commandPassword, setCommandPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [editingUser, setEditingUser] = useState<AccountUser | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [selectedPartition, setSelectedPartition] = useState("1");
  const [commandResult, setCommandResult] = useState("");
  const [creatingCentral, setCreatingCentral] = useState(false);
  const [centralToDelete, setCentralToDelete] = useState<Building | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showAllPartitions, setShowAllPartitions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const save = async (operation: () => Promise<void>) => {
    if (saving) return;
    setSaving(true);
    setFormError("");
    try { await operation(); }
    catch { setFormError("Não foi possível concluir a operação. Confira os dados e a conexão."); }
    finally { setSaving(false); }
  };

  const selectedCentral = buildings.find((central) => central.isep === selectedIsep) ?? buildings[0];
  const activeIsep = selectedCentral?.isep ?? "";
  const filteredPartitions = centralPartitions
    .filter((partition) => partition.isep === activeIsep)
    .sort((a, b) => Number(a.partition) - Number(b.partition));
  const filteredZones = centralZones
    .filter((zone) => zone.isep === activeIsep)
    .sort((a, b) => Number(a.partition) - Number(b.partition) || Number(a.zone) - Number(b.zone));
  const filteredUsers = users
    .filter((user) => user.isep === activeIsep || (!user.isep && user.account === activeIsep))
    .sort((a, b) => Number(a.partition) - Number(b.partition) || Number(a.user_number) - Number(b.user_number));
  const filteredPartitionCameras = partitionCameras.filter((mapping) => mapping.isep === activeIsep);
  const filteredZoneCameras = zoneCameras.filter((mapping) => mapping.isep === activeIsep);
  const partitionStatuses = statusesByIsep[activeIsep] ?? [];
  const partitionNumbers = Array.from({ length: 8 }, (_, index) => String(index + 1));
  const selectedPartitionRecord = filteredPartitions.find((partition) => partition.partition === selectedPartition);
  const selectedPartitionZones = filteredZones.filter((zone) => zone.partition === selectedPartition);
  const selectedPartitionUsers = filteredUsers.filter((user) => user.partition === selectedPartition);
  const matchingUsers = selectedPartitionUsers.filter((user) =>
    `${user.user_number} ${user.user_name}`.toLowerCase().includes(userSearch.trim().toLowerCase())
  );

  const resetUserForm = () => {
    setEditingUser(null);
    setUserForm({ partition: selectedPartition, user_number: "", user_name: "", description: "" });
  };

  useEffect(() => {
    resetUserForm();
    setUserSearch("");
  }, [activeIsep, selectedPartition]);

  useEffect(() => {
    if (!selectedIsep && buildings.length > 0) setSelectedIsep(buildings[0].isep);
  }, [buildings, selectedIsep]);

  useEffect(() => {
    if (!activeIsep) return;
    const savedPassword = localStorage.getItem(`centralCommandPassword:${activeIsep}`);
    setCommandPassword("");
    setPasswordSaved(Boolean(savedPassword));
    setCommandResult("");
  }, [activeIsep]);

  useEffect(() => {
    if (filteredPartitions.length === 0) {
      setSelectedPartition("1");
      return;
    }

    if (!filteredPartitions.some((partition) => partition.partition === selectedPartition)) {
      setSelectedPartition(filteredPartitions[0].partition);
    }
  }, [filteredPartitions, selectedPartition]);

  useEffect(() => {
    const partition = selectedPartitionRecord;
    const partitionCameraIds = partitionCameras
      .filter((mapping) => mapping.isep === activeIsep && mapping.partition === selectedPartition)
      .sort((a, b) => a.order - b.order)
      .map((mapping) => mapping.iss_camera_id);
    setPartitionForm({
      partition: selectedPartition,
      partition_name: partition?.partition_name ?? `Particao ${selectedPartition}`,
      description: partition?.description ?? ""
    });
    setZoneForm({ partition: selectedPartition, zone: "", zone_name: "", description: "" });
    setPartitionCameraForm({
      partition: selectedPartition,
      camera_ids: partitionCameraIds.join(", ")
    });
    setZoneCameraForm({ partition: selectedPartition, zone: "", camera_ids: "" });
  }, [activeIsep, selectedPartition, selectedPartitionRecord?.id, selectedPartitionRecord?.partition_name, selectedPartitionRecord?.description]);

  const refreshPartitionStatus = async () => {
    if (!activeIsep) return;
    setCommandResult("Consultando status da central...");
    await onRefreshCentral(activeIsep);
    setCommandResult("Status solicitado. A leitura compartilhada sera atualizada na tela.");
  };

  const sendPartitionCommand = async (cmd: "armar" | "desarmar", partition: string) => {
    if (!activeIsep || !partition) return;
    setCommandResult("");
    await onPartitionCommand(activeIsep, cmd, Number(partition));
  };

  const statusForPartition = (partition: string) => {
    return partitionStatuses.find((status) => String(status.pos) === String(Number(partition)));
  };

  const isPartitionEnabled = (partition: string) => {
    return filteredPartitions.some((item) => item.partition === partition);
  };

  const togglePartition = async (partition: string, enabled: boolean) => {
    if (!activeIsep) return;

    if (enabled) {
      await api.post("/central-partitions", {
        isep: activeIsep,
        partition,
        partition_name: `Particao ${partition}`,
        description: ""
      });
      setSelectedPartition(partition);
      await onChanged();
      return;
    }

    await api.delete(`/central-partitions/${activeIsep}/${partition}`);
    if (selectedPartition === partition) {
      const nextPartition = filteredPartitions.find((item) => item.partition !== partition)?.partition ?? "1";
      setSelectedPartition(nextPartition);
    }
    await onChanged();
  };

  const submitUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeIsep) return;
    await save(async () => {
      const userNumber = userForm.user_number.trim();
      const userName = userForm.user_name.trim();
      if (!userNumber || !userName || (!editingUser && selectedPartitionUsers.some((user) => user.user_number === userNumber))) {
        setFormError("Informe um número disponível nesta partição e o nome do usuário.");
        return;
      }
      await api.post("/users", {
        ...userForm, partition: selectedPartition, user_number: userNumber, user_name: userName,
        isep: editingUser ? editingUser.isep ?? undefined : activeIsep,
        account: editingUser?.account ?? activeIsep
      });
      resetUserForm();
      await onChanged();
    });
  };

  const submitCentral = async (event: FormEvent) => {
    event.preventDefault();
    await save(async () => {
      const isep = centralForm.isep.trim().toUpperCase();
      const name = centralForm.building_name.trim();
      if (!isep || !name || buildings.some((central) => central.isep.toUpperCase() === isep)) {
        setFormError("Informe um nome e um ISEP ainda não cadastrado.");
        return;
      }
      const { data } = await api.post<Building>("/buildings", { ...centralForm, isep, building_name: name });
      await onChanged();
      setSelectedIsep(data.isep);
      setCentralForm({ isep: "", building_name: "", description: "" });
      setCreatingCentral(false);
    });
  };

  const submitPartition = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeIsep) return;
    await save(async () => {
      await api.post("/central-partitions", { ...partitionForm, isep: activeIsep });
      await onChanged();
    });
  };

  const submitZone = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeIsep) return;
    await save(async () => {
      await api.post("/central-zones", { ...zoneForm, isep: activeIsep });
      setZoneForm({ partition: selectedPartition, zone: "", zone_name: "", description: "" });
      await onChanged();
    });
  };

  const submitPartitionCameras = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeIsep) return;
    await save(async () => {
      await api.post("/central-camera-mappings/partition", {
        isep: activeIsep,
        partition: partitionCameraForm.partition,
        camera_ids: parseCameraIds(partitionCameraForm.camera_ids)
      });
      await onChanged();
    });
  };

  const submitZoneCameras = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeIsep) return;
    await save(async () => {
      await api.post("/central-camera-mappings/zone", {
        isep: activeIsep,
        partition: zoneCameraForm.partition,
        zone: zoneCameraForm.zone,
        camera_ids: parseCameraIds(zoneCameraForm.camera_ids)
      });
      await onChanged();
      setZoneCameraForm({ partition: selectedPartition, zone: "", camera_ids: "" });
    });
  };

  const editPartitionCameras = (partition: string) => {
    setPartitionCameraForm({
      partition,
      camera_ids: cameraIdsForPartition(filteredPartitionCameras, partition).join(", ")
    });
  };

  const editZoneCameras = (partition: string, zone: string) => {
    setFormError("");
    setZoneCameraForm({
      partition,
      zone,
      camera_ids: cameraIdsForZone(filteredZoneCameras, partition, zone).join(", ")
    });
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
        <Typography variant="h6">Centrais ({buildings.length})</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => { setFormError(""); setCreatingCentral(true); }}>Nova central</Button>
      </Stack>
      {formError && !creatingCentral && !centralToDelete && !zoneCameraForm.zone && <Alert severity="error">{formError}</Alert>}
      <Dialog open={Boolean(centralToDelete)} fullWidth maxWidth="xs" onClose={saving ? undefined : () => setCentralToDelete(null)}>
        <form onSubmit={(event) => {
          event.preventDefault();
          const isep = centralToDelete?.isep;
          if (!isep || deleteConfirmation.trim() !== isep) return;
          void save(async () => {
            await api.delete(`/buildings/${encodeURIComponent(isep)}`);
            try { localStorage.removeItem(`centralCommandPassword:${isep}`); } catch {}
            setCentralToDelete(null);
            setSelectedIsep("");
            await onChanged();
          });
        }}>
          <DialogTitle>Excluir {centralToDelete?.building_name}</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Alert severity="warning">As partições, zonas, usuários vinculados e vínculos de câmeras serão removidos. O histórico de eventos e o catálogo de câmeras serão preservados.</Alert>
              {formError && <Alert severity="error">{formError}</Alert>}
              <TextField label={`Digite o ISEP ${centralToDelete?.isep ?? ""}`} value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)} disabled={saving} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button disabled={saving} onClick={() => setCentralToDelete(null)}>Cancelar</Button>
            <Button type="submit" color="error" variant="contained" disabled={saving || deleteConfirmation.trim() !== centralToDelete?.isep}>Excluir central</Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog open={creatingCentral} fullWidth maxWidth="xs" onClose={saving ? undefined : () => setCreatingCentral(false)}>
        <form onSubmit={submitCentral}>
          <DialogTitle>Nova central</DialogTitle>
          <DialogContent dividers>
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField size="small" label="ISEP da central" value={centralForm.isep} onChange={(e) => setCentralForm({ ...centralForm, isep: e.target.value })} required />
            <TextField size="small" label="Nome da central" value={centralForm.building_name} onChange={(e) => setCentralForm({ ...centralForm, building_name: e.target.value })} required />
            <TextField size="small" label="Observacao" value={centralForm.description} onChange={(e) => setCentralForm({ ...centralForm, description: e.target.value })} />
          </Stack>
          </DialogContent>
          <DialogActions>
            <Button disabled={saving} onClick={() => setCreatingCentral(false)}>Cancelar</Button>
            <Button disabled={saving} type="submit" variant="contained">Cadastrar central</Button>
          </DialogActions>
        </form>
      </Dialog>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4} lg={3}>
          <Grid container spacing={2}>
            {buildings.map((central) => {
              const centralEnabledPartitions = centralPartitions
                .filter((partition) => partition.isep === central.isep)
                .sort((a, b) => Number(a.partition) - Number(b.partition));
              const isSelected = central.isep === activeIsep;

              return (
                <Grid item xs={12} sm={6} md={12} key={central.id}>
                  <Paper
                    className="client-central-card"
                    onClick={() => { setShowAllPartitions(false); setSelectedIsep(central.isep); }}
                    sx={{
                      p: 2,
                      cursor: "pointer",
                      borderColor: isSelected ? "rgba(34, 87, 122, 0.55)" : "rgba(15, 23, 42, 0.08)",
                      boxShadow: isSelected ? "0 18px 48px rgba(34, 87, 122, 0.16)" : undefined
                    }}
                  >
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Box>
                          <Typography variant="h6">{central.building_name}</Typography>
                          <Typography variant="body2" color="text.secondary">ISEP {central.isep}</Typography>
                        </Box>
                        <Chip size="small" label={`${centralEnabledPartitions.length} part.`} />
                      </Stack>
                      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                        {centralEnabledPartitions.length > 0 ? (
                          centralEnabledPartitions.map((partition) => (
                            <Chip
                              key={partition.id}
                              size="small"
                              className={`partition-status-chip ${partitionStatusClass((statusesByIsep[central.isep] ?? []).find((status) => String(status.pos) === String(Number(partition.partition))))}`}
                              label={`P${partition.partition}`}
                            />
                          ))
                        ) : (
                          <Typography variant="body2" color="text.secondary">Sem particoes habilitadas</Typography>
                        )}
                      </Stack>
                    </Stack>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </Grid>

        <Grid item xs={12} md={8} lg={9}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            {selectedCentral ? (
              <Stack spacing={3}>
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
                  <Box>
                    <Typography variant="h5">{selectedCentral.building_name}</Typography>
                    <Button color="error" size="small" startIcon={<DeleteOutline />} disabled={saving} onClick={() => {
                      setFormError("");
                      setDeleteConfirmation("");
                      setCentralToDelete(selectedCentral);
                    }}>Excluir central</Button>
                    <Typography color="text.secondary">ISEP {activeIsep} · ultima consulta {formatDate(updatedAtByIsep[activeIsep])}</Typography>
                  </Box>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <TextField
                      label={passwordSaved ? "Nova senha de controle remoto" : "Senha de controle remoto"}
                      type="password"
                      autoComplete="new-password"
                      value={commandPassword}
                      onChange={(event) => setCommandPassword(event.target.value)}
                      size="small"
                      helperText={passwordSaved ? "Senha salva neste navegador" : "Nenhuma senha salva neste navegador"}
                    />
                    <Button variant="outlined" disabled={!commandPassword.trim()} onClick={() => {
                      try {
                        localStorage.setItem(`centralCommandPassword:${activeIsep}`, commandPassword.trim());
                        setPasswordSaved(true);
                        setCommandPassword("");
                        setCommandResult("Senha de controle remoto salva.");
                      } catch {
                        setCommandResult("Não foi possível salvar a senha neste navegador.");
                      }
                    }}>Salvar senha</Button>
                    {passwordSaved && <Button onClick={() => {
                      try {
                        localStorage.removeItem(`centralCommandPassword:${activeIsep}`);
                        setPasswordSaved(false);
                        setCommandPassword("");
                        setCommandResult("Senha removida deste navegador.");
                      } catch {
                        setCommandResult("Não foi possível remover a senha deste navegador.");
                      }
                    }}>Remover senha salva</Button>}
                    <Button variant="outlined" startIcon={<Refresh />} disabled={!activeIsep || loadingIsep === activeIsep} onClick={() => {
                      refreshPartitionStatus().catch((error) => setCommandResult(error.message));
                    }}>
                      Atualizar
                    </Button>
                  </Stack>
                </Stack>

                {commandResult ? <Alert severity="info">{commandResult}</Alert> : null}
                {statusMessage ? <Alert severity="info">{statusMessage}</Alert> : null}

                <Box>
                  <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700}>Partições em uso ({filteredPartitions.length})</Typography>
                    <Button size="small" onClick={() => setShowAllPartitions(!showAllPartitions)}>
                      {showAllPartitions ? "Concluir configuração" : "Configurar partições"}
                    </Button>
                  </Stack>
                  <Box className="enabled-partition-grid">
                    {partitionNumbers.filter((partition) => showAllPartitions || isPartitionEnabled(partition)).map((partition) => {
                      const enabled = isPartitionEnabled(partition);
                      const status = statusForPartition(partition);
                      return (
                        <Box
                          key={partition}
                          className={`enabled-partition-card ${enabled ? "enabled" : ""} ${selectedPartition === partition ? "selected" : ""}`}
                          onClick={() => enabled && setSelectedPartition(partition)}
                        >
                          {showAllPartitions ? <FormControlLabel
                            control={<Checkbox disabled={saving} checked={enabled} onChange={(event) => {
                              const checked = event.target.checked;
                              if (!checked && !window.confirm(`Remover P${partition} da central? Zonas e vínculos de câmeras podem ser removidos.`)) return;
                              void save(() => togglePartition(partition, checked));
                            }} />}
                            label={`P${partition}`}
                            onClick={(event) => event.stopPropagation()}
                          /> : <Button size="small" onClick={() => setSelectedPartition(partition)} aria-pressed={selectedPartition === partition}>P{partition}</Button>}
                          <Typography variant="body2" color="text.secondary">
                            {enabled ? selectedCentral && (filteredPartitions.find((item) => item.partition === partition)?.partition_name ?? `Particao ${partition}`) : "Nao habilitada"}
                          </Typography>
                          <Chip size="small" className={`partition-status-chip ${partitionStatusClass(status)}`} label={partitionStatusLabel(status)} />
                        </Box>
                      );
                    })}
                  </Box>
                </Box>

                {selectedPartitionRecord ? (
                  <Box className="partition-detail-panel">
                    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
                      <Box>
                        <Typography variant="h6">P{selectedPartition} · {selectedPartitionRecord.partition_name}</Typography>
                        <Typography variant="body2" color="text.secondary">Configure nome, zonas e cameras desta particao.</Typography>
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Button variant="outlined" startIcon={<LockOpen />} onClick={() => sendPartitionCommand("desarmar", selectedPartition).catch((error) => setCommandResult(error.message))}>
                          Desarmar
                        </Button>
                        <Button variant="contained" startIcon={<Lock />} onClick={() => sendPartitionCommand("armar", selectedPartition).catch((error) => setCommandResult(error.message))}>
                          Armar
                        </Button>
                      </Stack>
                    </Stack>

                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                      <Grid item xs={12} md={6}>
                        <Stack component="form" spacing={2} onSubmit={submitPartition}>
                          <Typography variant="subtitle2">Dados da particao</Typography>
                          <TextField label="Nome da particao" value={partitionForm.partition_name} onChange={(e) => setPartitionForm({ ...partitionForm, partition_name: e.target.value })} required />
                          <TextField label="Observacao" value={partitionForm.description} onChange={(e) => setPartitionForm({ ...partitionForm, description: e.target.value })} />
                          <Button type="submit" variant="outlined" startIcon={<Edit />}>Salvar nome</Button>
                        </Stack>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Stack component="form" spacing={2} onSubmit={submitPartitionCameras}>
                          <Typography variant="subtitle2">Grupo de cameras da particao</Typography>
                          <CameraPicker cameras={cameras}
                            ids={partitionCameraForm.camera_ids}
                            onChange={(camera_ids) => setPartitionCameraForm({ ...partitionCameraForm, camera_ids })}
                          />
                          <Button disabled={saving} type="submit" variant="outlined" startIcon={<CameraAlt />}>Salvar grupo</Button>
                        </Stack>
                      </Grid>
                    </Grid>

                    <Divider sx={{ my: 3 }} />

                    <Grid container spacing={2}>
                      <Grid item xs={12} md={5}>
                        <Stack component="form" spacing={2} onSubmit={submitZone}>
                          <Typography variant="subtitle2">Adicionar zona em P{selectedPartition}</Typography>
                          <TextField label="Zona" value={zoneForm.zone} onChange={(e) => setZoneForm({ ...zoneForm, zone: e.target.value })} required />
                          <TextField label="Nome da zona" value={zoneForm.zone_name} onChange={(e) => setZoneForm({ ...zoneForm, zone_name: e.target.value })} required />
                          <TextField label="Observacao" value={zoneForm.description} onChange={(e) => setZoneForm({ ...zoneForm, description: e.target.value })} />
                          <Button type="submit" variant="contained" startIcon={<Add />}>Salvar zona</Button>
                        </Stack>
                      </Grid>

                      <Grid item xs={12} md={7}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Zonas cadastradas</Typography>
                        <Stack spacing={1.25}>
                          {selectedPartitionZones.length > 0 ? (
                            selectedPartitionZones.map((zone) => {
                              const zoneCameraIds = cameraIdsForZone(filteredZoneCameras, zone.partition, zone.zone);
                              return (
                                <Box className="zone-row" key={zone.id}>
                                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                                    <Box>
                                      <Typography variant="subtitle2">Z{zone.zone} · {zone.zone_name}</Typography>
                                      <Typography variant="body2" color="text.secondary">{zone.description || "Sem observacao"}</Typography>
                                    </Box>
                                    <Button size="small" variant="outlined" startIcon={<CameraAlt />} onClick={() => editZoneCameras(zone.partition, zone.zone)}>
                                      Cameras
                                    </Button>
                                  </Stack>
                                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                                    {zoneCameraIds.length > 0 ? (
                                      zoneCameraIds.map((cameraId) => {
                                        const camera = cameras.find((item) => item.iss_camera_id === cameraId);
                                        return <Chip key={cameraId} size="small" icon={<CameraAlt />} label={camera ? `${camera.camera_name} (${cameraId})` : cameraId} />;
                                      })
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">Sem camera vinculada</Typography>
                                    )}
                                  </Stack>
                                </Box>
                              );
                            })
                          ) : (
                            <Typography variant="body2" color="text.secondary">Nenhuma zona cadastrada nesta particao.</Typography>
                          )}
                        </Stack>

                        <Dialog open={Boolean(zoneCameraForm.zone)} fullWidth maxWidth="sm" onClose={saving ? undefined : () => setZoneCameraForm({ partition: selectedPartition, zone: "", camera_ids: "" })}>
                          <form onSubmit={submitZoneCameras}>
                            <DialogTitle>Câmeras · P{selectedPartition} / Z{zoneCameraForm.zone}</DialogTitle>
                            <DialogContent dividers>
                              {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
                              <CameraPicker cameras={cameras} ids={zoneCameraForm.camera_ids}
                                onChange={(camera_ids) => setZoneCameraForm({ ...zoneCameraForm, camera_ids })} />
                            </DialogContent>
                            <DialogActions>
                              <Button disabled={saving} onClick={() => setZoneCameraForm({ partition: selectedPartition, zone: "", camera_ids: "" })}>Cancelar</Button>
                              <Button disabled={saving} type="submit" variant="contained" startIcon={<LinkIcon />}>Salvar vínculo</Button>
                            </DialogActions>
                          </form>
                        </Dialog>
                      </Grid>
                    </Grid>

                    <Divider sx={{ my: 3 }} />

                    <Grid container spacing={2}>
                      <Grid item xs={12} md={5}>
                        <Stack component="form" spacing={2} onSubmit={submitUser}>
                          <Typography variant="subtitle2">{editingUser ? `Editar usuário · P${selectedPartition}` : `Novo usuário · P${selectedPartition}`}</Typography>
                          <TextField label="Número do usuário" value={userForm.user_number} onChange={(e) => setUserForm({ ...userForm, user_number: e.target.value })} disabled={Boolean(editingUser)} required />
                          <TextField label="Nome do usuario" value={userForm.user_name} onChange={(e) => setUserForm({ ...userForm, user_name: e.target.value })} required />
                          <TextField label="Observacao" value={userForm.description} onChange={(e) => setUserForm({ ...userForm, description: e.target.value })} />
                          <Button disabled={saving} type="submit" variant="outlined" startIcon={editingUser ? <Edit /> : <Add />}>Salvar usuário</Button>
                          {editingUser && <Button disabled={saving} onClick={resetUserForm}>Cancelar edição</Button>}
                        </Stack>
                      </Grid>
                      <Grid item xs={12} md={7}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Usuários cadastrados ({selectedPartitionUsers.length})</Typography>
                        <TextField fullWidth size="small" label="Buscar por nome ou número" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
                        <List dense>
                          {matchingUsers.length > 0 ? matchingUsers.map((user) => (
                            <ListItem key={user.id} divider disableGutters>
                              <ListItemText primary={`Usuario ${user.user_number} · ${user.user_name}`} secondary={user.description || "Sem observacao"} />
                              <IconButton aria-label={`Editar usuário ${user.user_number}`} disabled={saving} onClick={() => {
                                setFormError("");
                                setEditingUser(user);
                                setUserForm({ partition: user.partition, user_number: user.user_number, user_name: user.user_name, description: user.description ?? "" });
                              }}><Edit /></IconButton>
                            </ListItem>
                          )) : (
                            <Typography variant="body2" color="text.secondary">Nenhum usuário encontrado.</Typography>
                          )}
                        </List>
                      </Grid>
                    </Grid>
                  </Box>
                ) : (
                  <Alert severity="info">Habilite uma particao para cadastrar zonas, cameras e usuarios.</Alert>
                )}
              </Stack>
            ) : (
              <Alert severity="info">Cadastre uma central para comecar.</Alert>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}

function CameraPicker({ cameras, ids, onChange }: { cameras: Camera[]; ids: string; onChange: (value: string) => void }) {
  const labels = new Map(cameras.map((camera) => [camera.iss_camera_id, camera.camera_name]));
  return (
    <Autocomplete multiple freeSolo fullWidth
      options={Array.from(labels.keys())}
      value={parseCameraIds(ids)}
      getOptionLabel={(id) => labels.has(id) ? `${labels.get(id)} (${id})` : id}
      onChange={(_, values) => onChange(Array.from(new Set(values.flatMap(parseCameraIds))).join(", "))}
      renderInput={(params) => <TextField {...params} label="Câmeras ISS" helperText="Busque por nome ou ID. Para incluir um ID avulso, pressione Enter." />}
    />
  );
}

function CamerasView({ cameras, onChanged }: { cameras: Camera[]; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({ iss_camera_id: "", camera_name: "", description: "" });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await api.post("/cameras", form);
    setForm({ iss_camera_id: "", camera_name: "", description: "" });
    await onChanged();
  };

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={4}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Cadastro de cameras</Typography>
          <Stack component="form" spacing={2} onSubmit={submit} sx={{ mt: 2 }}>
            <TextField label="ID no ISS" value={form.iss_camera_id} onChange={(e) => setForm({ ...form, iss_camera_id: e.target.value })} required />
            <TextField label="Nome" value={form.camera_name} onChange={(e) => setForm({ ...form, camera_name: e.target.value })} required />
            <TextField label="Descricao" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Button type="submit" variant="contained" startIcon={<Add />}>Salvar camera</Button>
          </Stack>
        </Paper>
      </Grid>
      <Grid item xs={12} md={8}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Cameras cadastradas</Typography>
          <List dense>
            {cameras.map((camera) => (
              <ListItem key={camera.id} divider>
                <ListItemText primary={`${camera.camera_name} (${camera.iss_camera_id})`} secondary={camera.description || "Sem descricao"} />
              </ListItem>
            ))}
          </List>
        </Paper>
      </Grid>
    </Grid>
  );
}

function ConfigView({
  viawebStatus,
  html5MediaClientId,
  issSetup,
  onHtml5MediaClientIdChange
}: {
  viawebStatus: Record<string, unknown> | null;
  html5MediaClientId: string;
  issSetup: Record<string, unknown> | null;
  onHtml5MediaClientIdChange: (value: string) => void;
}) {
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Configuracao</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            As configuracoes sensiveis ficam no arquivo `.env` do backend.
          </Typography>
          <Alert severity={issSetup ? "success" : "info"} sx={{ mt: 2 }}>
            {issSetup
              ? `ISScustomAPI.onSetup ativo. Media Client vinculado: ${String(issSetup.media_client_id ?? html5MediaClientId)}`
              : "ISScustomAPI.onSetup ainda nao foi recebido. No navegador comum isso e esperado."}
          </Alert>
          <TextField
            fullWidth
            label="Media Client do HTML5"
            helperText="Use o ID do objeto no SecurOS. Normalmente e 1, 2, 3..."
            value={html5MediaClientId}
            onChange={(event) => onHtml5MediaClientIdChange(event.target.value)}
            sx={{ mt: 2 }}
          />
        </Paper>
      </Grid>
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Receiver Viaweb</Typography>
          {viawebStatus ? (
            <Stack spacing={1} sx={{ mt: 1 }}>
              <Chip
                color={viawebStatus.connected ? "success" : "warning"}
                label={viawebStatus.connected ? "Conectado" : "Desconectado"}
              />
              <Typography variant="body2">Host: {String(viawebStatus.host)}:{String(viawebStatus.port)}</Typography>
              <Typography variant="body2">Criptografia: {viawebStatus.encryption ? "Ligada" : "Desligada"}</Typography>
              <Typography variant="body2">Mensagens recebidas: {String(viawebStatus.messagesReceived ?? 0)}</Typography>
              <Typography variant="body2">Eventos recebidos: {String(viawebStatus.eventsReceived ?? 0)}</Typography>
              <Typography variant="body2">Ultima mensagem: {formatDate(viawebStatus.lastMessageAt)}</Typography>
              <Typography variant="body2">Ultimo evento: {formatDate(viawebStatus.lastEventAt)}</Typography>
              {viawebStatus.lastError ? <Alert severity="warning">{String(viawebStatus.lastError)}</Alert> : null}
            </Stack>
          ) : (
            <Typography color="text.secondary" sx={{ mt: 1 }}>Carregando status...</Typography>
          )}
        </Paper>
      </Grid>
    </Grid>
  );
}

function formatDate(value: unknown) {
  if (!value) return "-";
  return new Date(String(value)).toLocaleString();
}

function lastTreatmentSummary(event: EventRecord) {
  const sortedTreatments = [...(event.treatments ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const lastTreatment = sortedTreatments.length > 0 ? sortedTreatments[sortedTreatments.length - 1] : undefined;

  if (!lastTreatment) return "sem tratativa registrada";
  return `${lastTreatment.action} em ${formatDate(lastTreatment.created_at)} por ${lastTreatment.operator_name ?? "Operador"} - ${lastTreatment.note ?? "sem observacao"}`;
}

function eventListStatusClass(event: EventRecord) {
  if (event.status === "ENCERRADO") return "status-ok";
  if (event.error_message) return "status-fail";
  return "status-pending";
}

function parseCameraIds(value: string) {
  return value
    .split(/[,\n;]/)
    .map((cameraId) => cameraId.trim())
    .filter(Boolean);
}

function parsePartitionList(value: string) {
  return value
    .split(/[,;\s]+/)
    .map((partition) => Number(partition.trim()))
    .filter((partition) => Number.isInteger(partition) && partition >= 1 && partition <= 8);
}

function cameraIdsForPartition(mappings: CentralPartitionCamera[], partition: string) {
  return mappings
    .filter((mapping) => mapping.partition === partition)
    .sort((a, b) => a.order - b.order)
    .map((mapping) => mapping.iss_camera_id);
}

function partitionStatusLabel(status?: PartitionStatus) {
  if (!status) return "nao consultado";
  const armed = status.armado === 1 ? "armada" : "desarmada";
  const triggered = status.disparado === 1 ? " / disparada" : "";
  return `${armed}${triggered}`;
}

function partitionStatusClass(status?: PartitionStatus) {
  if (!status) return "partition-unknown";
  if (status.disparado === 1) return "partition-alarm";
  if (status.armado === 1) return "partition-armed";
  return "partition-disarmed";
}

function visibleCentralPartitions(
  isep: string,
  centralPartitions: CentralPartition[],
  statuses: PartitionStatus[]
) {
  const saved = parsePartitionList(localStorage.getItem(`centralVisiblePartitions:${isep}`) ?? "");
  const registered = centralPartitions
    .filter((partition) => partition.isep === isep)
    .map((partition) => ({
      partition: Number(partition.partition),
      name: partition.partition_name
    }))
    .filter((partition) => Number.isInteger(partition.partition));

  const source = saved.length > 0
    ? saved.map((partition) => ({ partition, name: registered.find((item) => item.partition === partition)?.name ?? `Particao ${partition}` }))
    : registered.length > 0
      ? registered
      : statuses.length > 0
        ? statuses.map((status) => ({ partition: status.pos, name: `Particao ${status.pos}` }))
        : [1, 2].map((partition) => ({ partition, name: `Particao ${partition}` }));

  return source
    .filter((partition) => partition.partition >= 1 && partition.partition <= 8)
    .sort((a, b) => a.partition - b.partition);
}

function cameraIdsForZone(mappings: CentralZoneCamera[], partition: string, zone: string) {
  return mappings
    .filter((mapping) => mapping.partition === partition && mapping.zone === zone)
    .sort((a, b) => a.order - b.order)
    .map((mapping) => mapping.iss_camera_id);
}

export default App;
