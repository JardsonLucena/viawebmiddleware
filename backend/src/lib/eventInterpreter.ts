export type InterpretedEvent = {
  qualifier: string;
  category: string;
  eventType: string;
  action: string;
  subject: "zone" | "user" | "system";
  description: string;
};

const contactIdCodes: Record<string, { category: string; label: string; subject: InterpretedEvent["subject"] }> = {
  "100": { category: "Médico", label: "Emergência médica", subject: "system" },
  "110": { category: "Incêndio", label: "Alarme de incêndio", subject: "zone" },
  "120": { category: "Pânico", label: "Alarme de pânico", subject: "zone" },
  "130": { category: "Alarme", label: "Alarme de intrusão", subject: "zone" },
  "131": { category: "Alarme", label: "Alarme perimetral", subject: "zone" },
  "132": { category: "Alarme", label: "Alarme interno", subject: "zone" },
  "133": { category: "Alarme", label: "Alarme 24 horas", subject: "zone" },
  "134": { category: "Alarme", label: "Entrada/saída", subject: "zone" },
  "135": { category: "Alarme", label: "Alarme dia/noite", subject: "zone" },
  "137": { category: "Sabotagem", label: "Tamper", subject: "zone" },
  "140": { category: "Alarme", label: "Alarme geral", subject: "zone" },
  "301": { category: "Falha", label: "Falha de energia AC", subject: "system" },
  "302": { category: "Falha", label: "Bateria baixa", subject: "system" },
  "321": { category: "Falha", label: "Falha de sirene", subject: "system" },
  "400": { category: "Abertura/Fechamento", label: "Abertura/fechamento", subject: "user" },
  "401": { category: "Abertura/Fechamento", label: "Aberto/fechado por usuário", subject: "user" },
  "402": { category: "Abertura/Fechamento", label: "Armado/desarmado por usuário", subject: "user" },
  "407": { category: "Abertura/Fechamento", label: "Armado/desarmado remoto", subject: "user" },
  "570": { category: "Bypass", label: "Zona anulada", subject: "zone" },
  "602": { category: "Teste", label: "Teste periódico", subject: "system" }
};

export function interpretContactId(eventCode: string, partition?: string | number, zoneOrUser?: string | number): InterpretedEvent {
  const normalized = eventCode.trim().toUpperCase();
  const qualifierDigit = normalized[0] ?? "";
  const baseCode = normalized.slice(-3);
  const meta = contactIdCodes[baseCode] ?? {
    category: "Evento",
    label: `Código Contact ID ${baseCode || normalized}`,
    subject: "system" as const
  };

  const qualifier = qualifierDigit === "3" ? "Restauro/fechamento" : "Evento/abertura";
  const action = resolveAction(qualifierDigit, baseCode, meta.label);
  const suffix = buildSuffix(meta.subject, partition, zoneOrUser);

  return {
    qualifier,
    category: meta.category,
    eventType: resolveEventType(qualifierDigit, baseCode, meta.category),
    action,
    subject: meta.subject,
    description: `${action}${suffix}`
  };
}

function resolveEventType(qualifierDigit: string, baseCode: string, category: string) {
  if (qualifierDigit === "3") return baseCode === "402" || baseCode === "401" ? "ARMADO" : "RESTAURO";
  if (baseCode === "402" || baseCode === "401" || baseCode === "407") return "DESARMADO";
  if (baseCode === "570") return "BYPASS";
  if (baseCode === "120") return "PANICO";
  if (baseCode === "137") return "TAMPER";
  if (baseCode === "302") return "BATERIA_BAIXA";
  if (category === "Falha") return "FALHA_COMUNICACAO";
  if (category === "Alarme" || category === "IncÃªndio") return "DISPARO";
  return "OUTRO";
}

function resolveAction(qualifierDigit: string, baseCode: string, label: string) {
  if (baseCode === "402") return qualifierDigit === "3" ? "Armado" : "Desarmado";
  if (baseCode === "401") return qualifierDigit === "3" ? "Fechamento por usuário" : "Abertura por usuário";
  if (qualifierDigit === "3") return `Restauro de ${label.toLowerCase()}`;
  return label;
}

function buildSuffix(subject: InterpretedEvent["subject"], partition?: string | number, zoneOrUser?: string | number) {
  const partitionText = partition !== undefined && String(partition) !== "0" ? ` partição ${partition}` : "";
  if (subject === "zone" && zoneOrUser !== undefined && String(zoneOrUser) !== "0") {
    return `${partitionText} - zona ${zoneOrUser}`;
  }
  if (subject === "user" && zoneOrUser !== undefined && String(zoneOrUser) !== "0") {
    return `${partitionText} por usuário ${zoneOrUser}`;
  }
  return partitionText;
}
