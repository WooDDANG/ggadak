# 01: Fly.io에서 BE와 Bot 함께 실행

**What to build:** 단일 Fly Machine에서 BE와 Discord Bot이 함께 실행되고 Bot이 내부 주소로 BE에 연결된다. HTTP 요청이 없어도 Bot의 Discord 연결과 BE의 백그라운드 분석을 계속 처리한다.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] 배포 이미지에 BE와 Bot이 포함되고, 마이그레이션 완료 후 두 프로세스가 기동한다.
- [x] Bot은 같은 Machine의 BE 주소를 사용하고 기존 인증 및 Discord 설정을 적용한다.
- [x] 어느 한 프로세스가 예기치 않게 종료되면 장애가 숨겨지지 않으며 Machine 재시작으로 복구할 수 있다. 종료 신호는 두 프로세스에 전달된다.
- [x] HTTP 유휴 상태에서도 Machine이 자동 정지되지 않도록 설정한다. 상시 실행에 따른 체험 한도 및 비용 영향을 명시한다.
- [ ] 실제 Discord 자격 증명 없이 기동·종료·내부 연결을 검증하고 기존 BE 테스트를 통과한다. FE 테스트는 실행하지 않는다.

## 검증 메모

이미지 빌드와 BE 전체 테스트 통과. Discord 토큰이 없는 임시 컨테이너에서 Bot 종료가 컨테이너 실패로 전파됨을 확인했다. 실제 Discord 연결과 두 프로세스의 정상 동시 실행은 아직 확인하지 못했다.
