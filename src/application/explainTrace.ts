import type { TraceRecord } from '../core/contracts'

/** Explain the captured event, never infer historical state from today's device tables. */
export function explainTrace(event: TraceRecord): string {
  if (event.type === 'switch-flood')
    return 'Switch는 목적지 MAC을 모르거나 Broadcast를 받으면 입력 포트를 제외한 연결된 포트로 프레임을 전달합니다.'
  if (event.type === 'switch-forward')
    return 'Switch는 학습한 MAC 테이블을 사용해 목적지 포트로 프레임을 전달합니다. IPv4 TTL은 바꾸지 않습니다.'
  if (event.before && event.after && event.before.ttl !== event.after.ttl)
    return `Router가 패킷을 전달하면서 TTL을 ${event.before.ttl}에서 ${event.after.ttl}로 줄였습니다.`
  if (event.type === 'nat')
    return 'Router가 NAT 테이블에 따라 주소 또는 포트 식별자를 변환했습니다. 아래 변경 전후 헤더를 비교하세요.'
  if (event.reason) {
    if (event.reason.includes('ttl'))
      return 'TTL을 모두 사용하여 패킷이 폐기됐습니다. 라우팅 루프 또는 너무 작은 TTL을 확인하세요.'
    if (event.reason.includes('route'))
      return '목적지와 일치하는 사용 가능한 경로가 없습니다. 게이트웨이와 정적 경로, 반환 경로를 확인하세요.'
    if (event.reason.includes('loss'))
      return '링크에 설정한 손실률에 따라 프레임이 손실됐습니다. TCP는 응답을 기다린 뒤 재전송할 수 있습니다.'
    if (event.reason.includes('arp'))
      return '다음 Hop의 MAC 주소를 ARP로 확인하지 못했습니다. 주소와 연결 상태를 확인하세요.'
  }
  const frame = event.frame
  if (frame && 'kind' in frame.payload && frame.payload.kind === 'arp') {
    const arp = frame.payload
    return arp.operation === 'request'
      ? `${arp.senderIp}가 ${arp.targetIp}의 MAC 주소를 묻는 ARP 요청입니다. 요청은 같은 Ethernet 영역으로 Broadcast됩니다.`
      : `${arp.senderIp}가 자신의 MAC 주소 ${arp.senderMac}를 알려주는 ARP 응답입니다.`
  }
  if (event.type === 'route-selected')
    return `목적지에 일치하는 경로 중 가장 긴 Prefix를 선택합니다. 실제 선택 결과: ${event.message}`
  if (event.protocol === 'DHCP')
    return `DHCP 주소 할당 단계입니다. Offer는 주소 예약이며 ACK를 받아야 클라이언트 설정에 적용됩니다. ${event.message}`
  if (event.protocol === 'DNS')
    return `DNS는 이름을 IP 주소로 바꿉니다. 조회에 성공한 뒤 그 주소로 실제 패킷을 전송합니다. ${event.message}`
  return event.message
}
