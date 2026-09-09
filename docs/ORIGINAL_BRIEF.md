너는 최고 수준의 소프트웨어 아키텍트이자 네트워크 엔지니어이며, AI 코딩 에이전트 오케스트레이션 전문가다.

내 목표는 **NetLab**이라는 교육용 네트워크 시뮬레이터를 실제로 개발하는 것이다.

하지만 지금 네가 해야 할 일은 NetLab을 직접 구현하는 것이 아니다.

네 임무는:

**Astra와 같은 병렬 AI 코딩 에이전트에게 그대로 입력해서 NetLab 전체 프로젝트를 구현시킬 수 있는, 매우 상세하고 실행 가능한 “최종 개발 마스터 프롬프트”를 작성하는 것**이다.

즉 구조는 다음과 같다.

현재 프롬프트
→ 네가 NetLab 개발용 최종 프롬프트 작성
→ 그 최종 프롬프트를 Astra에 입력
→ Astra가 실제 프로젝트 구현

최종 결과물은 단순한 기획서가 아니라, AI 개발 에이전트가 저장소를 생성하고 실제 코드를 작성하고 테스트하며 완성도 높은 애플리케이션까지 만들 수 있을 정도로 구체적이어야 한다.

---

# 1. 프로젝트 개요

프로젝트 이름:

**NetLab**

NetLab은 Cisco Packet Tracer를 훨씬 단순화하고 현대적인 UI로 재구성한 **교육용 네트워크 시뮬레이터**다.

사용자는 캔버스 위에 네트워크 장비를 배치하고 서로 연결하여 가상의 네트워크를 구성할 수 있다.

예:

PC ── Switch ── Router ── Router ── Server

사용자는 각각의 장비에 IP 주소, Subnet Mask, Gateway 등을 설정할 수 있다.

그 후 PC에서 다른 장비를 대상으로 `ping` 같은 명령을 실행하면 네트워크 내부에서 발생하는 과정을 시각적으로 확인할 수 있어야 한다.

예:

ARP Request
↓
ARP Reply
↓
ICMP Echo Request
↓
Switch Forwarding
↓
Routing Table Lookup
↓
Next Hop 결정
↓
ICMP Echo Request
↓
Server 도착
↓
ICMP Echo Reply
↓
원래 PC로 반환

패킷은 네트워크 링크를 따라 실제로 이동하는 것처럼 애니메이션으로 표현된다.

사용자가 패킷을 클릭하면 해당 패킷의 Header와 주요 필드를 확인할 수 있어야 한다.

---

# 2. 프로젝트의 핵심 목표

NetLab의 가장 중요한 목적은

**“네트워크에서 실제로 무슨 일이 일어나는지 눈으로 이해할 수 있게 만드는 것”**

이다.

따라서 단순히 네트워크 그림을 만드는 다이어그램 툴이 되어서는 안 된다.

네트워크 동작을 시뮬레이션해야 한다.

동시에 Wireshark나 Packet Tracer처럼 초보자에게 지나치게 복잡해서도 안 된다.

교육용 시각화와 실제 네트워크 개념 사이의 균형이 중요하다.

---

# 3. 필수 지원 장비

최소 다음 장비를 지원한다.

## End Device

* PC
* Server

## Network Device

* Ethernet Switch
* Router

향후 확장 가능하도록 장비 시스템을 설계한다.

예:

* Hub
* Wireless Router
* Access Point
* Firewall
* DNS Server
* DHCP Server

등을 이후 쉽게 추가할 수 있어야 한다.

---

# 4. 네트워크 구성 UI

캔버스 기반 UI를 사용한다.

가능하면 React Flow 또는 현재 생태계에서 더 적합한 라이브러리를 검토하고 가장 적절한 기술을 선택하도록 최종 프롬프트에서 지시하라.

사용자는 다음 작업을 할 수 있어야 한다.

* 장비 Drag & Drop
* 장비 이동
* 장비 삭제
* 장비 복제
* 장비 간 Ethernet Link 연결
* 링크 삭제
* 여러 포트를 가진 장비 표현
* 장비 선택
* 링크 선택
* 확대 / 축소
* 화면 이동
* 전체 네트워크 보기
* Undo / Redo
* Save
* Load
* New Project

장비 선택 시 오른쪽 Inspector 또는 Properties Panel에서 설정을 변경한다.

예:

PC

Name
PC1

Interface
eth0

IP Address
192.168.1.10

Subnet Mask
255.255.255.0

Default Gateway
192.168.1.1

MAC Address
자동 생성

---

# 5. 네트워크 시뮬레이션

NetLab은 브라우저 안에서 동작하는 **논리적 네트워크 시뮬레이터**다.

실제 OS의 네트워크 스택이나 raw socket을 사용하는 것이 아니라,

가상의

* Packet
* Frame
* Interface
* Device
* Link

객체를 기반으로 한 시뮬레이션 엔진을 구현한다.

가능하다면 **Discrete Event Simulation** 또는 이에 준하는 이벤트 기반 구조를 사용한다.

시뮬레이션 엔진은 UI와 강하게 결합되어서는 안 된다.

가능하면

Simulation Core
↕
Application State
↕
Visualization / UI

형태로 분리한다.

시뮬레이션 코어는 UI 없이도 테스트 가능해야 한다.

---

# 6. 기본 데이터 모델

최종 프롬프트에서는 최소 다음과 같은 개념을 명확하게 설계하게 하라.

Network

Device

Interface

Port

Link

Packet

EthernetFrame

MACAddress

IPAddress

Subnet

RoutingTable

RoutingEntry

ARPTable

SwitchMACTable

SimulationEvent

SimulationClock

PacketTrace

ProtocolHandler

각 객체의 책임과 관계를 명확히 정의하도록 한다.

---

# 7. Ethernet

Ethernet Layer를 단순화하여 구현한다.

지원할 개념:

* Source MAC
* Destination MAC
* EtherType
* Ethernet Frame
* Broadcast
* Unicast

프레임이 Switch를 통과하는 과정도 시뮬레이션한다.

---

# 8. Switch

Switch는 Layer 2 장비로 동작한다.

필수 기능:

MAC Address Learning

MAC Address Table

Unknown Unicast Flooding

Broadcast Flooding

Known Destination Forwarding

예:

MAC Table

Port 1
AA:AA:AA:AA:AA:01

Port 2
BB:BB:BB:BB:BB:02

사용자가 Switch를 클릭하면 현재 MAC Table을 볼 수 있어야 한다.

---

# 9. ARP

ARP를 구현한다.

PC가 같은 Subnet의 IP 주소로 패킷을 보내려고 하지만 MAC 주소를 모르면:

ARP Request 생성

FF:FF:FF:FF:FF:FF Broadcast

Switch Flood

대상 Host ARP Reply

ARP Table Update

이후 실제 패킷 전송

과정을 모두 이벤트로 기록한다.

사용자가 패킷 타임라인에서 이 과정을 볼 수 있도록 한다.

---

# 10. IPv4

최소 IPv4를 지원한다.

IPv6는 초기 버전에서는 필수가 아니다.

지원할 개념:

* Source IP
* Destination IP
* TTL
* Protocol
* Subnet Mask
* Network Address
* Host Address
* Default Gateway
* Next Hop

IPv4 Header 전체를 RFC 수준으로 모두 구현해야 하는 것은 아니지만 교육적으로 중요한 필드는 표현한다.

---

# 11. ICMP

가장 먼저 완성해야 하는 실제 시뮬레이션 기능이다.

PC Terminal에서 다음처럼 입력할 수 있다.

ping 192.168.2.10

그러면

ARP
→ Ethernet
→ IP
→ Routing
→ ICMP

과정을 시뮬레이션한다.

지원:

ICMP Echo Request

ICMP Echo Reply

TTL Expired

Destination Unreachable

Ping 결과 예:

PING 192.168.2.10

Reply from 192.168.2.10
time=32ms
TTL=63

Request timed out

등.

---

# 12. Router

Router는 Layer 3 forwarding을 담당한다.

여러 Interface를 가진다.

예:

Router1

eth0
192.168.1.1/24

eth1
10.0.0.1/30

Routing Table 예:

192.168.1.0/24
direct
eth0

10.0.0.0/30
direct
eth1

192.168.2.0/24
via 10.0.0.2
eth1

지원 기능:

* Connected Route
* Static Route
* Default Route
* Longest Prefix Match
* Next Hop
* TTL 감소
* TTL Expired
* Interface Up / Down

라우터 클릭 시 Routing Table을 볼 수 있게 한다.

---

# 13. Routing Algorithm

초기 버전에서는 Static Routing 중심으로 구현한다.

그 이후 확장 Phase에서 Dynamic Routing을 추가할 수 있도록 구조를 설계한다.

선택적으로 다음을 교육용으로 단순화하여 구현할 수 있다.

RIP 또는 Distance Vector Routing

혹은

Dijkstra 기반 자동 라우팅 모드

단 실제 네트워크 프로토콜과 교육용 자동 경로 계산 기능을 혼동하지 않도록 명확하게 구분한다.

---

# 14. UDP

UDP Packet을 시뮬레이션한다.

주요 필드:

Source Port

Destination Port

Length

Payload

Connectionless transmission을 시각화한다.

---

# 15. TCP

TCP는 프로젝트의 중요한 고급 기능이다.

최소 다음을 시각화한다.

3-Way Handshake

SYN

SYN-ACK

ACK

Data Transfer

ACK

Connection Close

FIN

ACK

FIN

ACK

필요하면 교육적 이해를 위해 일부 동작을 단순화하되, TCP의 핵심 개념을 왜곡해서는 안 된다.

Packet Inspector에서 다음과 같은 정보가 보여야 한다.

TCP

Source Port
52001

Destination Port
80

Sequence
1000

Acknowledgment
1001

Flags
SYN

---

# 16. DHCP

DHCP를 지원한다.

시각적으로

DHCP Discover

DHCP Offer

DHCP Request

DHCP ACK

DORA 과정을 보여준다.

DHCP Server 설정:

IP Pool

Subnet Mask

Default Gateway

DNS Server

Lease Time

PC 설정에서 DHCP를 선택하면 IP가 자동 할당된다.

---

# 17. DNS

간단한 DNS Server를 구현한다.

DNS Record 예:

example.local
→
192.168.2.10

PC에서

ping example.local

을 실행하면

DNS Query

DNS Response

이후 ICMP 과정

을 볼 수 있다.

---

# 18. NAT

Router에 NAT 기능을 추가한다.

최소:

Private IP

Public IP

NAT Table

Source NAT

PAT

정도를 교육용으로 표현한다.

NAT 전후 패킷 Header 변화도 Packet Inspector에서 비교할 수 있도록 설계한다.

---

# 19. Network Conditions

각 Link에 다음 값을 설정할 수 있게 한다.

Latency

Packet Loss

Bandwidth

Link State

예:

Latency
50 ms

Packet Loss
5%

Bandwidth
10 Mbps

패킷 이동 애니메이션과 시뮬레이션 결과에 반영한다.

가능하면 Queueing을 지나치게 복잡하지 않은 형태로 모델링한다.

---

# 20. 장애 시뮬레이션

사용자가

Router Power Off

Interface Down

Link Down

등을 실행할 수 있어야 한다.

그 결과

Packet Drop

Destination Unreachable

Route unavailable

등이 발생해야 한다.

Dynamic Routing 또는 Auto Routing 기능이 활성화된 경우 새로운 경로를 계산하고 시각적으로 보여줄 수 있어야 한다.

---

# 21. Packet Animation

이 프로젝트의 핵심 UX다.

패킷이

PC
→ Switch
→ Router
→ Router
→ Server

링크를 따라 이동하는 애니메이션을 보여준다.

프로토콜에 따라 Packet의 시각적 구분이 가능해야 한다.

예:

ARP
ICMP
TCP
UDP
DNS
DHCP

단 색상만으로 프로토콜을 구분하지 말고 아이콘, 라벨 또는 텍스트도 함께 사용해 접근성을 확보한다.

패킷 이동 속도는 Simulation Speed와 연동한다.

---

# 22. Simulation Controls

화면 하단 또는 적절한 위치에 다음 컨트롤을 제공한다.

Play

Pause

Step

Reset

Speed

예:

0.25x
0.5x
1x
2x
4x

Step Mode에서는 네트워크 이벤트를 하나씩 진행할 수 있어야 한다.

---

# 23. Event Timeline

모든 네트워크 이벤트를 Timeline에 기록한다.

예:

0.000
PC1 sends ARP Request

0.002
Switch1 receives Ethernet Broadcast

0.004
Switch1 floods frame to Port 2

0.010
Router1 receives ARP Request

0.012
Router1 sends ARP Reply

사용자가 이벤트를 클릭하면 해당 순간의 관련 장비와 패킷을 강조한다.

필터:

ARP

ICMP

TCP

UDP

DNS

DHCP

Routing

Dropped Packet

---

# 24. Packet Inspector

패킷을 클릭하면 Header Stack을 보여준다.

예:

Ethernet II

Source MAC
AA:AA:AA:AA:AA:01

Destination MAC
BB:BB:BB:BB:BB:02

IPv4

Source
192.168.1.10

Destination
192.168.2.10

TTL
64

Protocol
ICMP

ICMP

Type
8 Echo Request

Code
0

또한 Packet이 Router를 통과하면서

TTL 64
→
TTL 63

MAC Header 변경

NAT Translation

등이 발생하면 변경 전/후를 비교할 수 있으면 좋다.

---

# 25. Terminal

PC와 Server에 간단한 Terminal UI를 제공한다.

초기 명령:

help

ipconfig

ifconfig

ping

arp

route

traceroute

nslookup

clear

일부 명령은 실제 OS 명령과 완전히 동일할 필요는 없지만 네트워크 교육에 도움이 되도록 한다.

예:

PC1> ping 192.168.2.10

PC1> arp

PC1> traceroute 192.168.2.10

---

# 26. Traceroute

ICMP TTL을 이용해 Router 경로를 보여주는 traceroute 기능을 구현한다.

예:

1 192.168.1.1 10ms

2 10.0.0.2 25ms

3 192.168.2.10 40ms

각 단계가 네트워크 캔버스에서도 시각적으로 강조되도록 설계한다.

---

# 27. Save / Load

사용자가 만든 네트워크 Topology를 저장할 수 있어야 한다.

저장 데이터:

Devices

Interfaces

Links

IP Configuration

Routing Tables

DHCP Configuration

DNS Records

NAT Configuration

Link Conditions

UI Position

가능하다면 JSON 기반 프로젝트 포맷을 정의한다.

예:

.netlab.json

또는

JSON export/import

LocalStorage 또는 IndexedDB를 사용할 수 있다.

백엔드가 실제로 필요하지 않다면 억지로 서버를 만들지 않는다.

---

# 28. 샘플 네트워크

초기 실행 시 학습용 Example Topology를 제공한다.

예:

Example 1
Same LAN Ping

PC ─ Switch ─ PC

Example 2
Router Ping

PC ─ Switch ─ Router ─ Switch ─ Server

Example 3
Two Routers

PC
│
Switch
│
Router1
│
Router2
│
Switch
│
Server

Example 4
DHCP Network

Example 5
DNS + Web Server

Example 6
NAT Network

---

# 29. UI / UX 방향

디자인은 기존 Cisco Packet Tracer를 그대로 복제하지 않는다.

현대적인 개발 도구 스타일을 목표로 한다.

참고 방향:

VS Code

Linear

Vercel

Figma

현대적인 DevTool Dashboard

다크 모드를 기본으로 고려한다.

화면 구조 예:

┌───────────────────────────────────────────────┐
│ Toolbar                                       │
├──────────┬───────────────────────┬────────────┤
│ Devices  │                       │ Inspector  │
│          │       Canvas          │            │
│ PC       │                       │ Properties │
│ Server   │                       │            │
│ Switch   │                       │            │
│ Router   │                       │            │
├──────────┴───────────────────────┴────────────┤
│ Simulation Timeline / Terminal                │
└───────────────────────────────────────────────┘

과도한 Glassmorphism이나 장식 위주의 UI는 피한다.

실제 개발 툴처럼 정보 밀도가 높으면서도 깔끔하게 만든다.

---

# 30. 기술 선택

최종 개발 프롬프트를 작성할 때 네가 현재 프로젝트 요구사항에 가장 적절한 기술 스택을 결정하라.

우선 검토 후보:

TypeScript

React

Vite 또는 적절한 Frontend Framework

React Flow

Zustand 또는 적절한 State Management

Tailwind CSS

Vitest

Playwright

다만 무조건 이 기술을 사용할 필요는 없다.

더 적합한 기술이 있다면 변경 가능하다.

단 다음 조건은 지켜야 한다.

* 전체 프로젝트 TypeScript 우선
* 브라우저에서 실행
* 외부 AI API 사용 금지
* OpenAI API 사용 금지
* Anthropic API 사용 금지
* Gemini API 사용 금지
* 별도 AI 기능 필요 없음
* 가능한 한 로컬에서 실행 가능
* 불필요한 백엔드 금지
* 과도한 Infrastructure 금지
* Docker가 필요하지 않으면 사용하지 않음
* 유지보수 가능한 구조

---

# 31. Architecture

최종 프롬프트에서는 Astra에게 구현 전에 반드시 전체 Architecture를 설계하도록 지시한다.

예상 구조는 대략 다음과 같은 형태가 적절하다.

src/

core/
simulation/
network/
protocols/
ethernet/
arp/
ipv4/
icmp/
udp/
tcp/
dhcp/
dns/
nat/
routing/

devices/
pc/
server/
switch/
router/

events/

ui/
canvas/
nodes/
edges/
panels/
terminal/
timeline/
packet-inspector/

state/

storage/

utils/

tests/

단 이것은 예시다.

더 좋은 구조가 있다면 바꿔도 된다.

핵심은

**네트워크 시뮬레이션 엔진과 UI를 철저하게 분리하는 것**이다.

---

# 32. Architecture Document

실제 구현을 시작하기 전에 반드시

ARCHITECTURE.md

를 만든다.

여기에 최소 다음을 기록한다.

Project Goals

Non-Goals

Tech Stack

Folder Structure

Simulation Architecture

Device Model

Packet Model

Event System

Protocol Architecture

State Management

UI Architecture

Persistence

Testing Strategy

Agent Ownership

Module Dependency Rules

향후 구조가 크게 변경되면 코드보다 먼저 ARCHITECTURE.md를 수정하게 한다.

---

# 33. Agent 병렬 개발

이 프로젝트는 Astra의 병렬 Agent / Worktree 기능을 적극 활용해야 한다.

최종 프롬프트에서는 작업을 독립성이 높은 영역으로 나누고 각 Agent에 명확한 책임을 할당하게 한다.

예:

Agent 1
Simulation Core

Agent 2
Canvas / React Flow UI

Agent 3
Ethernet / ARP / Switch

Agent 4
IPv4 / ICMP / Routing

Agent 5
TCP / UDP

Agent 6
DHCP / DNS / NAT

Agent 7
Packet Animation / Timeline / Inspector

Agent 8
Save / Load / Examples

Agent 9
Testing / Integration

단순히 이 목록을 그대로 쓰지 말고,

실제 코드 Dependency를 분석하여 동시에 작업 가능한 모듈과 선행 작업이 필요한 모듈을 구분한 뒤 병렬화 계획을 만들어라.

Agent 간에 같은 파일을 동시에 수정해서 Merge Conflict가 많이 발생하지 않도록 Ownership을 명확하게 정의한다.

---

# 34. Shared Contracts 우선

병렬 개발 전에 공통 Interface와 Type을 먼저 결정해야 한다.

예:

Device

NetworkInterface

Packet

EthernetFrame

SimulationEvent

Link

ProtocolHandler

등.

Shared Contract가 정해지기 전에 여러 Agent가 각자 다른 형태로 구현하지 않도록 한다.

필요하면 초기 Architecture Agent가 먼저 최소 Skeleton과 Interface만 만들고 그 이후 Agent들이 병렬 작업하도록 한다.

---

# 35. 구현 Phase

최종 마스터 프롬프트는 NetLab을 단계별 Phase로 나눈다.

단순히 기능 목록 순서대로 구현하지 말고,

**각 Phase가 실행 가능한 제품을 만드는 Vertical Slice 방식**을 우선 고려한다.

예를 들어 좋은 초기 흐름은 다음과 비슷할 수 있다.

Phase 0
Architecture + Foundation

Phase 1
Canvas + Device + Link

Phase 2
Simulation Engine

Phase 3
Ethernet + Switch + ARP

Phase 4
IPv4 + Router + ICMP + Ping

Phase 5
Timeline + Packet Animation + Inspector

Phase 6
Routing + Traceroute + Failure

Phase 7
UDP + TCP

Phase 8
DHCP + DNS

Phase 9
NAT + Network Conditions

Phase 10
Save / Load + Example Labs

Phase 11
UX Polish + Testing + Performance

하지만 네가 Dependency를 분석해서 더 적절한 Phase 구성을 만들어라.

---

# 36. 각 Phase 종료 규칙

각 Phase가 끝날 때 AI Agent는 반드시 다음을 수행해야 한다.

1. 구현 완료 기능 요약
2. 생성/수정 파일 요약
3. Architecture 변경 사항
4. 실행 방법
5. 테스트 결과
6. 현재 알려진 문제
7. 다음 Phase에서 할 일

그리고 실제로

Build

Type Check

Unit Test

가능하다면 E2E Test

를 실행한다.

컴파일되지 않는 상태에서 Phase를 완료했다고 선언하지 않는다.

---

# 37. 테스트 전략

테스트는 매우 중요하다.

특히 Simulation Core는 UI와 독립적으로 Unit Test가 가능해야 한다.

예:

같은 Subnet PC 두 대

PC1
192.168.1.10

PC2
192.168.1.20

PC1 → PC2 ping

예상:

ARP Request

ARP Reply

ICMP Echo Request

ICMP Echo Reply

두 Router 환경

PC
192.168.1.10

Router1
192.168.1.1
10.0.0.1

Router2
10.0.0.2
192.168.2.1

Server
192.168.2.10

예상:

PC → Gateway

Router1 Route Lookup

Router2 Forward

Server

Reply reverse path

등을 테스트한다.

반드시 다음 Edge Case도 테스트한다.

Invalid IP

Wrong Subnet Mask

Missing Gateway

Missing Route

Interface Down

Link Down

TTL Expired

Packet Loss 100%

Unknown ARP

Duplicate IP

TCP Timeout

DHCP Pool Exhausted

DNS Record Missing

---

# 38. Deterministic Simulation

테스트 가능성을 위해 Simulation Core는 최대한 Deterministic하게 설계한다.

Packet Loss 같이 Randomness가 필요한 기능은 Seeded Random 또는 주입 가능한 Random Source를 사용한다.

테스트에서는 항상 같은 결과를 만들 수 있게 한다.

---

# 39. Simulation Time

실제 JavaScript setTimeout에 프로토콜 로직을 직접 의존하지 않는다.

Simulation Clock 또는 Event Queue를 사용해 가상 시간을 관리하는 구조를 고려한다.

예:

SimulationClock

PriorityQueue<SimulationEvent>

event.time

event.type

event.source

event.destination

event.payload

이런 구조를 활용해

Pause

Resume

Step

Speed Control

Testing

을 쉽게 한다.

---

# 40. 정확성과 단순화

이 프로젝트는 실제 Router OS를 만드는 것이 아니다.

따라서 실제 Ethernet / TCP / IP RFC를 byte-level로 완벽하게 구현하는 것은 목표가 아니다.

하지만 교육적으로 중요한 동작을 잘못 구현해서도 안 된다.

최종 프롬프트에서 각 프로토콜마다

실제 네트워크에서의 동작

NetLab에서 구현할 범위

NetLab에서 의도적으로 단순화할 부분

을 명확하게 구분하도록 요구한다.

---

# 41. Out of Scope

초기 버전에서는 다음과 같은 기능은 우선순위를 낮춘다.

Real packet capture

Raw socket

Kernel networking

BGP

OSPF 전체 구현

IPv6

VLAN Trunk 전체 구현

STP 전체 구현

MPLS

Wireless Simulation

Firewall ACL 전체 기능

QoS 전체 구현

실제 Cisco CLI 완전 복제

멀티플레이 서버

클라우드 동기화

로그인 시스템

AI 기능

AI API

이러한 기능 때문에 핵심 프로젝트가 과도하게 복잡해지지 않게 한다.

---

# 42. Code Quality

최종 프롬프트에서 다음을 강제한다.

TypeScript strict mode

any 최소화

명확한 Type Definition

작은 Module

Single Responsibility

Protocol 간 강결합 금지

UI에서 Protocol Logic 구현 금지

Simulation Core에서 React Import 금지

Magic Number 최소화

명확한 Error Type

필요한 곳에만 주석

죽은 코드 제거

임시 Mock을 Production 기능처럼 남겨두지 않음

TODO 남발 금지

---

# 43. 성능

큰 네트워크에서도 UI가 지나치게 느려지지 않도록 한다.

초기 목표 예:

50~100 Devices

100~200 Links

동시에 수십~수백 개 Simulation Event

정도를 무리 없이 처리하도록 설계한다.

모든 Packet Animation 때문에 React 전체가 매 Frame re-render되는 구조는 피한다.

Simulation State와 UI Rendering State를 적절히 분리한다.

---

# 44. UX 핵심

사용자가 네트워크를 모르는 초보자라고 가정한다.

설정 오류가 발생하면 단순히

ERROR

만 보여주지 않는다.

예:

“PC1의 목적지 192.168.2.10은 현재 서브넷에 포함되지 않지만 Default Gateway가 설정되어 있지 않습니다.”

처럼 무엇이 문제인지 알려준다.

가능하면 관련 장비를 강조한다.

---

# 45. Educational Mode

가능하면 교육용 기능을 설계한다.

예:

Packet 설명

“PC1 does not know the MAC address for 192.168.1.1, so it sends an ARP Request.”

Router 설명

“Router1 found 192.168.2.0/24 in its routing table.”

Drop 설명

“Packet dropped because TTL reached 0.”

이를 통해 Timeline 자체가 네트워크 학습 자료처럼 동작하게 한다.

---

# 46. Demo 시나리오

최종 프로젝트에서 시연하기 좋은 대표 시나리오를 반드시 만든다.

대표 Demo:

PC1
192.168.1.10/24

↓

Switch1

↓

Router1
192.168.1.1/24
10.0.0.1/30

↓

Router2
10.0.0.2/30
192.168.2.1/24

↓

Switch2

↓

Server1
192.168.2.10/24

PC1에서

ping 192.168.2.10

실행.

사용자는

ARP

Switch MAC Learning

Default Gateway

Router Forwarding

Routing Table Lookup

TTL 감소

ICMP Echo Request

ICMP Echo Reply

을 Timeline과 Animation을 통해 볼 수 있어야 한다.

이 시나리오는 반드시 자동 테스트 가능한 형태로도 만든다.

---

# 47. README

최종 프로젝트 README에는 최소 다음을 포함한다.

NetLab 소개

Demo Screenshot 또는 GIF를 넣을 위치

Features

Architecture

How Network Simulation Works

Supported Protocols

Getting Started

Development

Testing

Project Structure

Example Labs

Roadmap

Known Simplifications

교육 목적임을 설명하는 부분

---

# 48. 포트폴리오 관점

NetLab은 단순 프론트엔드 프로젝트처럼 보여서는 안 된다.

README와 Architecture를 통해 다음 기술적 포인트가 드러나게 한다.

Discrete Event Simulation

Network Protocol Modeling

Graph-based Network Topology

Routing

State Machine

TCP State

Event-driven Architecture

Visualization

Deterministic Testing

Frontend Architecture

Complex State Management

따라서 포트폴리오에서

“React Flow로 노드 몇 개 연결했다”

수준이 아니라

“브라우저 기반 네트워크 프로토콜 시뮬레이션 엔진을 설계했다”

고 설명할 수 있는 프로젝트가 되어야 한다.

---

# 49. Astra 작업 방식 최적화

최종 프롬프트는 Astra가 병렬 작업을 효과적으로 수행하도록 설계해야 한다.

다음을 포함한다.

어떤 Agent가 무엇을 담당하는지

어떤 작업이 병렬 가능한지

어떤 작업은 선행되어야 하는지

각 Agent가 수정 가능한 디렉터리

공유 Type 관리 방법

Merge 순서

Integration Agent 역할

Test Agent 역할

Review Agent 역할

각 Worktree의 책임

Agent 간 Hand-off 방식

가능하면 파일 Ownership Matrix까지 만든다.

예:

core/**
→ Simulation Agent

protocols/arp/**
→ Layer2 Agent

protocols/tcp/**
→ Transport Agent

ui/canvas/**
→ Canvas Agent

ui/timeline/**
→ Visualization Agent

tests/**
→ Test Agent

단 실제 Architecture에 맞게 최적화한다.

---

# 50. Agent에게 과도한 중단을 요구하지 말 것

Astra는 긴 작업을 스스로 수행할 수 있으므로 사소한 구현 결정을 할 때마다 사용자에게 질문하게 만들지 않는다.

다음과 같은 경우에는 스스로 합리적으로 결정한다.

변수명

파일명

Component 세분화

UI spacing

테스트 이름

내부 helper 구조

라이브러리의 minor 선택

단 다음처럼 프로젝트 방향을 크게 바꾸는 결정은 명확하게 기록해야 한다.

Architecture 변경

핵심 기술 스택 변경

Scope 대폭 변경

Protocol 동작의 중요한 단순화

---

# 51. 실제 동작 우선

Placeholder UI를 잔뜩 만들어놓고 기능이 있다고 주장해서는 안 된다.

예를 들어

TCP 버튼만 존재하지만 TCP 시뮬레이션이 없는 상태

DHCP Panel은 있지만 DORA가 동작하지 않는 상태

Packet Animation은 있지만 실제 Simulation Event와 무관한 상태

등을 금지한다.

UI가 제공하는 기능은 실제 Simulation Core와 연결되어 있어야 한다.

---

# 52. 검증

각 기능 구현 후 가능한 경우 Browser 또는 E2E Testing으로 실제 사용자 흐름을 검증한다.

예:

Router 두 개 배치

PC와 Server 배치

Link 연결

IP 입력

Static Route 입력

PC Terminal 열기

ping 실행

Packet Animation 확인

Timeline 확인

Echo Reply 확인

이 전체 흐름을 테스트한다.

---

# 53. 최종 Polish

모든 핵심 기능 구현 후 마지막 Phase에서는 반드시 전체 프로젝트를 검토한다.

찾아야 할 것:

Broken UI

Dead Buttons

Fake Functionality

Console Errors

TypeScript Errors

Broken Responsive Layout

State Synchronization Bug

Simulation Race Condition

Memory Leak

Animation Bug

Save/Load Bug

Invalid Network Configuration Handling

Accessibility 문제

그리고 발견된 문제를 실제로 수정한다.

---

# 54. 최종 프롬프트 작성 방식

이제 위 요구사항을 분석해서

**Astra에게 그대로 붙여 넣을 수 있는 하나의 완성된 개발 마스터 프롬프트**

를 작성하라.

단순히 내가 적어준 요구사항을 다시 정리하는 데 그치지 말고,

시니어 아키텍트의 관점에서 부족한 부분을 찾아 보완해야 한다.

특히 다음을 네가 직접 설계하라.

1. 최종 기술 스택
2. Architecture
3. Domain Model
4. Simulation Engine
5. Event Model
6. Packet Model
7. Protocol Architecture
8. Device Architecture
9. State Management
10. UI Architecture
11. Persistence
12. Testing Architecture
13. Agent 분할
14. Worktree 전략
15. Agent Dependency Graph
16. Implementation Phase
17. Acceptance Criteria
18. Definition of Done
19. Integration Strategy
20. 최종 검증 전략

---

# 55. 출력 구조

네 답변은 오직 실제 Astra에 입력할 **최종 개발 마스터 프롬프트**여야 한다.

그 최종 프롬프트 안에는 최소 다음 Section을 포함한다.

# NetLab

## 0. Mission

## 1. Product Vision

## 2. Core Principles

## 3. Scope

## 4. Non-Goals

## 5. Tech Stack

## 6. Architecture

## 7. Domain Model

## 8. Simulation Engine

## 9. Device Model

## 10. Protocol Model

## 11. UI / UX

## 12. Project Structure

## 13. Coding Rules

## 14. Testing Strategy

## 15. Agent Architecture

## 16. Worktree Ownership

## 17. Dependency Graph

## 18. Implementation Phases

## 19. Phase Acceptance Criteria

## 20. Integration Strategy

## 21. Demo Scenarios

## 22. Performance Requirements

## 23. Error Handling

## 24. Educational Features

## 25. Persistence

## 26. README / Documentation

## 27. Final QA

## 28. Definition of Done

## 29. Execution Instructions

필요하면 Section을 추가해도 된다.

---

# 56. 중요

최종 프롬프트는 “무엇을 만들 것인지”만 설명해서는 안 된다.

반드시

**어떤 순서로**

**어떤 Architecture로**

**어떤 Agent가**

**어떤 파일을 담당하고**

**어떻게 테스트하고**

**어떻게 Integration하며**

**무엇을 만족해야 다음 단계로 넘어가는지**

까지 명시해야 한다.

Astra가 이 프롬프트 하나만 읽고도 프로젝트 전체를 상당 부분 자율적으로 개발할 수 있어야 한다.

---

# 57. 지나친 Overengineering 방지

기술적으로 멋있어 보인다는 이유만으로 다음을 추가하지 않는다.

Microservices

Kafka

Kubernetes

GraphQL

Redis

PostgreSQL

별도 Backend

Message Broker

WebSocket Server

Cloud Infrastructure

실제 프로젝트 요구사항에 필요하지 않은 기술은 사용하지 않는다.

브라우저 내부 TypeScript 애플리케이션만으로 충분하면 그것을 우선한다.

---

# 58. 의존성 검증

새 라이브러리를 선택할 때는 다음을 확인하도록 최종 프롬프트에 명시하라.

현재 유지보수되고 있는가

TypeScript 지원이 좋은가

프로젝트 규모에 비해 지나치게 무겁지 않은가

기존 Stack과 충돌하지 않는가

불필요한 Dependency는 아닌가

---

# 59. 네트워크 정확성 검토

프로토콜 구현 Agent와 별도로 Review 역할을 두어,

ARP

Switch Forwarding

Subnet 판정

Default Gateway

Routing

Longest Prefix Match

TTL

ICMP

TCP Handshake

DHCP DORA

DNS

NAT

동작이 네트워크 원리와 크게 어긋나지 않는지 검토하게 한다.

발견된 오류는 문서화만 하지 말고 수정한다.

---

# 60. 최종 목표

최종 결과물은 사용자가 브라우저에서 NetLab을 열어

Router와 PC를 직접 배치하고,

IP를 설정하고,

네트워크를 연결하고,

Terminal에서 ping을 실행한 뒤,

ARP → Switching → Routing → ICMP가 실제 Simulation Engine을 통해 처리되고,

패킷이 화면을 이동하며,

Timeline에서 각 Event를 확인하고,

Packet Inspector에서 Header를 분석할 수 있는

**실제로 동작하는 교육용 네트워크 시뮬레이터**

여야 한다.

시각적 데모가 아니라 실제 시뮬레이션이 핵심이다.

---

이제 위 요구사항을 바탕으로 NetLab을 구현하기 위한 **최고 품질의 Astra용 최종 개발 마스터 프롬프트**를 작성하라.

프로젝트를 직접 구현하지 마라.

나에게 설명하거나 요약하지 마라.

질문하지 마라.

최종 결과물은 복사해서 Astra에 바로 입력할 수 있는 하나의 완성된 프롬프트만 출력하라.
