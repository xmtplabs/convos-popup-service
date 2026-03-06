import client from 'prom-client';

export function createMetrics() {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });

  const requestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [registry],
  });

  const requestCount = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });

  const groupsCreated = new client.Counter({
    name: 'popup_groups_created_total',
    help: 'Total groups created',
    labelNames: ['namespace'],
    registers: [registry],
  });

  const verifications = new client.Counter({
    name: 'popup_verifications_total',
    help: 'Total user verifications',
    labelNames: ['namespace'],
    registers: [registry],
  });

  const tokenExchanges = new client.Counter({
    name: 'popup_token_exchanges_total',
    help: 'Total token exchanges',
    labelNames: ['status', 'namespace'],
    registers: [registry],
  });

  const activeGroups = new client.Gauge({
    name: 'popup_active_groups',
    help: 'Number of active groups',
    registers: [registry],
  });

  // --- Agent XMTP operation durations ---

  const agentOpBuckets = [0.1, 0.5, 1, 2, 5, 10, 30, 60];

  const agentCreateGroupDuration = new client.Histogram({
    name: 'popup_agent_create_group_duration_seconds',
    help: 'Duration of XMTP createGroup operations',
    labelNames: ['status'],
    buckets: agentOpBuckets,
    registers: [registry],
  });

  const agentPromoteMembersDuration = new client.Histogram({
    name: 'popup_agent_promote_members_duration_seconds',
    help: 'Duration of XMTP promoteAllMembers operations',
    labelNames: ['status'],
    buckets: agentOpBuckets,
    registers: [registry],
  });

  const agentLeaveGroupDuration = new client.Histogram({
    name: 'popup_agent_leave_group_duration_seconds',
    help: 'Duration of XMTP leaveGroup operations',
    labelNames: ['status'],
    buckets: agentOpBuckets,
    registers: [registry],
  });

  // --- Agent init ---

  const agentInitDuration = new client.Histogram({
    name: 'popup_agent_init_duration_seconds',
    help: 'Duration of XMTP agent initialization',
    labelNames: ['status'],
    buckets: [0.5, 1, 2, 5, 10, 30, 60, 120],
    registers: [registry],
  });

  // --- Agent connection state ---

  const agentConnected = new client.Gauge({
    name: 'popup_agent_connected',
    help: 'Whether the XMTP agent is connected (1) or not (0)',
    registers: [registry],
  });

  // --- Agent event counters ---

  const agentMemberJoins = new client.Counter({
    name: 'popup_agent_member_joins_total',
    help: 'Total member join events processed by agent',
    registers: [registry],
  });

  const agentGroupsReady = new client.Counter({
    name: 'popup_agent_groups_ready_total',
    help: 'Total groups that reached ready state',
    registers: [registry],
  });

  const agentMemberJoinErrors = new client.Counter({
    name: 'popup_agent_member_join_errors_total',
    help: 'Total errors during member join processing',
    registers: [registry],
  });

  const agentInvitesCreated = new client.Counter({
    name: 'popup_agent_invites_created_total',
    help: 'Total invites created by agent',
    registers: [registry],
  });

  // --- Group lifecycle funnel ---

  const groupLifecycleTransitions = new client.Counter({
    name: 'popup_group_lifecycle_transitions_total',
    help: 'Group lifecycle funnel transitions',
    labelNames: ['transition'],
    registers: [registry],
  });

  // --- Group timing ---

  const groupTimingBuckets = [5, 15, 30, 60, 120, 300, 600, 1800, 3600];

  const groupTimeToFirstJoin = new client.Histogram({
    name: 'popup_group_time_to_first_join_seconds',
    help: 'Time from group creation to first member join',
    buckets: groupTimingBuckets,
    registers: [registry],
  });

  const groupTimeToAllJoined = new client.Histogram({
    name: 'popup_group_time_to_all_joined_seconds',
    help: 'Time from group creation to all members joined',
    buckets: groupTimingBuckets,
    registers: [registry],
  });

  const groupTimeToReady = new client.Histogram({
    name: 'popup_group_time_to_ready_seconds',
    help: 'Time from group creation to group ready (after promotions)',
    buckets: groupTimingBuckets,
    registers: [registry],
  });

  // --- Group size distribution ---

  const groupMemberCount = new client.Histogram({
    name: 'popup_group_member_count',
    help: 'Distribution of group member counts',
    buckets: [2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 50],
    registers: [registry],
  });

  return {
    registry,
    requestDuration,
    requestCount,
    groupsCreated,
    verifications,
    tokenExchanges,
    activeGroups,
    agentCreateGroupDuration,
    agentPromoteMembersDuration,
    agentLeaveGroupDuration,
    agentInitDuration,
    agentConnected,
    agentMemberJoins,
    agentGroupsReady,
    agentMemberJoinErrors,
    agentInvitesCreated,
    groupLifecycleTransitions,
    groupTimeToFirstJoin,
    groupTimeToAllJoined,
    groupTimeToReady,
    groupMemberCount,
  };
}
