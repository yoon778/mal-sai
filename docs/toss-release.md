# 말사이 토스 출시 준비

## 구현 범위

- Apps in Toss Web Framework 3.3.0, Vite 8.2.2, `.ait` 빌드 연결
- SDK의 `User.getAnonymousKey` 식별값을 서버가 토스 mTLS API로 검증
- 운영 API의 HTTPS 공개 주소와 토스 정식·QR 테스트 출처만 허용
- 사용자별 SQLite 기록, AES-256-GCM 암호화, 재접속·서버 재시작 후 복원
- 스키마 버전 1 초기화는 트랜잭션으로 처리하며 알 수 없는 상위 버전과 잘못된 암호화 키는 시작 차단
- 기록 조회·전체 삭제·AI 답장 신고, 운영자 신고 조회와 AI 중지 명령
- AI 입력·출력 안전 검사, 검사 실패 시 응답 차단, 사용자별 하루 요청 한도와 기존 누적 3달러 상한 유지

정식 서비스 배포는 아직 하지 않았습니다. 현재 생성한 시험 패키지는 연결되지 않는 `https://api.example.invalid` 주소를 사용하므로 제출용이 아닙니다.

검증: 자동 테스트 38개, 평가 사례 30개, 토스 패키징 통과. 로컬 브라우저에서 서버 재시작 후 복원·최근 ID 유실 복구·신고·5턴 완주·설문·기록 재열기·삭제 실패 재시도를 확인했습니다. 320/375/768/1440px에서 가로 넘침과 JavaScript 오류가 없었고, 실제 OpenAI 안전 분류 API 호출도 정상 응답했습니다. 토스 native back 콜백은 브라우저 모의 호출로 확인했으며 실제 기기 검증은 남아 있습니다.

## 로컬 실행

Node 24 이상에서 `npm ci`, `npm start`를 실행합니다. `.env`의 기존 API 키를 사용하며 `.data/storage.key`를 자동 생성합니다. `.data/practice.sqlite`와 이 키를 함께 보존해야 이전 기록을 읽을 수 있습니다. 이전 버전의 서버 메모리에만 존재하던 대화는 이관할 저장 파일이 없습니다.

## 운영 API

1. 토스 콘솔에서 앱 이름을 확정하고 mTLS 인증서와 개인키를 발급합니다. `mal-sai`는 현재 개발용 이름이며 사용 가능 여부를 아직 확인하지 않았습니다.
2. HTTPS 도메인과 지속 디스크가 있는 서버를 준비합니다. Dockerfile은 Node 기본 모듈만 사용하는 API 서버이며 TLS 종료 프록시 뒤에서 실행합니다. 프록시는 원래 Host를 유지하고 3000번 포트를 외부에 직접 공개하지 않습니다.
3. `.env.toss.example`의 서버 설정을 호스팅 비밀 설정에 등록합니다. `STORAGE_KEY`는 무작위 32바이트의 64자리 hex입니다. 인증서 파일과 키는 읽기 전용으로 마운트하고 `/data`는 쓰기 가능한 영구 볼륨으로 연결합니다.
4. 서버를 한 인스턴스로 운영합니다. 현재 요청 잠금과 SQLite/예산 파일 구조는 여러 인스턴스 배포를 지원하지 않습니다.

`AI_BUDGET_USD=3`은 서버 전체 누적 한도이며 매일 자동 초기화되지 않습니다. 사용자별 기본 한도는 UTC 날짜 기준 100회 요청입니다. 실패·차단 요청도 횟수에 포함됩니다. 비용 상한 변경은 운영 예산을 정한 뒤 별도 검토합니다.

## 미니앱 빌드와 검사

로컬 `.env.toss`에는 공개 빌드 값 `VITE_API_ORIGIN`과 `TOSS_APP_NAME`을 설정합니다. API 키나 인증서를 `VITE_` 변수로 만들지 않습니다.

```sh
npm run build:toss
npm run preflight:toss
```

빌드는 로컬 `.ait` 파일 생성까지만 수행합니다. 업로드나 심사 신청은 하지 않습니다. 출시 전 검사에는 서버 환경값도 필요합니다. 도메인·앱 이름이 빌드와 일치하는지, 고객지원 이메일·정식 개인정보 안내·실기기 검증이 완료됐는지 확인합니다.

## 운영 점검

```sh
npm run reports:list
npm run reports:list -- --details
npm run ai:pause
npm run ai:resume
npm run feedback:summary
```

운영 환경에서는 같은 명령에 `DATA_DIRECTORY`, `STORAGE_KEY`를 환경 변수로 제공합니다. 기본 신고 목록은 식별번호·이유·접수 시각만 출력합니다. `--details`는 신고된 AI 답장도 출력하므로 운영자만 사용합니다. 중지 명령은 `.data/ai-paused` 파일로 입력 검사와 출력 공개를 차단합니다.

기록·설문·신고는 마지막 저장 30일 후 만료하며 최대 1시간 후 정리합니다. 전체 삭제는 세 종류의 사용자 기록을 지우고 이용 한도 우회 방지를 위해 최근 횟수만 잠시 유지합니다. 신규 비용 로그에는 대화 ID와 대화 내용을 남기지 않습니다. 이전 버전의 `.data/usage.jsonl`, `feedback.jsonl`, 실험 결과는 자동 삭제·이관하지 않으므로 로컬 실험 디렉터리를 운영 서버에 통째로 복사하지 마세요.

## 사용자 작업이 필요한 단계

- 토스 콘솔 가입·앱 이름 확정·인증서 발급
- API 호스팅 계정·도메인 연결
- 실제 운영자·고객지원 연락처와 개인정보 처리방침, 국외 처리 안내 확정
- 토스 Android/iOS에서 실제 식별키 검증, 앱 종료 후 복원, 뒤로 가기·닫기, 키보드·안전 영역, 느린 네트워크, 신고·삭제 확인
- 콘솔의 앱 아이콘·소개·스크린샷 등록과 심사 신청

실제 토스 기기와 mTLS 검증은 계정·인증서 없이는 완료할 수 없습니다. 브라우저 테스트와 패키지 빌드 통과를 토스 출시 승인으로 간주하지 않습니다. AI 응답 품질은 별도 사용자 평가가 필요하며 안전 필터가 모든 위험을 탐지한다고 보장하지 않습니다.

## 확인한 공식 자료

- [사용자 식별키 검증 API](https://developers-apps-in-toss.toss.im/api/user-key)
- [토스 서버 API 연결](https://developers-apps-in-toss.toss.im/documentation/integration/server-api)
- [비게임 출시 체크리스트](https://developers-apps-in-toss.toss.im/checklist/app-nongame)
- [AI 채팅 서비스 유의사항](https://developers-apps-in-toss.toss.im/intro/caution)
- [OpenAI 안전 분류 API](https://developers.openai.com/api/docs/guides/moderation)

AI 모델이나 프롬프트 변경도 토스의 현행 심사 안내에 따라 배포 전 검토합니다. 현재 화면의 데이터 안내는 출시 준비용 초안입니다.
