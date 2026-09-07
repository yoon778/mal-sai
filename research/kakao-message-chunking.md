# 한국어 메신저 말풍선 분절 기준

확인일: 2026-09-07

## 관찰

- 국립국어원 메신저 말뭉치는 1,459만 발화와 712만 말차례로, 말차례당 약 2.05개 발화입니다. 연인 관계 자료도 1,499,233발화와 727,447말차례로 약 2.06개입니다. 수집 지침은 특별한 이유 없는 한 글자·한 단어 분절과 한 화자의 말풍선 5개 이상 연속 사용을 피하도록 합니다. [K01]
- WhatsApp 대화에서는 한 기여를 여러 게시물로 보내는 `chunking`이 관찰되지만 모든 기여를 나누지는 않습니다. 게시물은 하나의 행동 또는 행동 구성요소를 담습니다. [K02]
- 카카오톡 대화는 중단과 긴 시간 간격, 둘 이상의 화제 동시 진행, 웃음·동의 같은 청자 반응을 포함합니다. [K03]
- 메신저 발화는 한 음절부터 완전한 문장까지 다양하며 문장부호, 자모, 이모티콘이 감정과 준언어 정보를 전달합니다. [K04]
- 질문 뒤 후속 질문은 호감과 반응성을 높일 수 있지만, 질문만 이어가기보다 상대 답에 반응하고 자기 이야기를 섞는 흐름이 필요합니다. [K05]

## 제품 규칙

- AI 한 말차례는 보통 1~3개 말풍선
- 반응 → 내용 답변·자기 이야기 → 되묻기처럼 대화 행동이 바뀌는 지점에서 분할
- `아 맞다`, `진짜요?`, `좋네요`, `ㅋㅋ`처럼 독립 의미가 있는 짧은 반응은 간헐 허용
- 조사·서술어 분리, 글자 수 기준 자르기, 같은 뜻 반복, 매번 같은 개수 금지
- 성별은 고정 말투가 아닌 인물 설정의 한 요소로만 사용. 친밀도·적극성·농담 선호를 함께 반영
- 실제 분포는 공개되지 않았으므로 1·2·3개 비율은 제품 가정으로 검증

## 출처

- K01 국립국어원, [메신저 대화 자료 수집 및 말뭉치 구축](https://www.korean.go.kr/common/download.do?c_file_name=9269d178-1ef0-4325-9987-438871b99ffe_0.pdf&file_path=reportData&o_file_name=%EB%A9%94%EC%8B%A0%EC%A0%80+%EB%8C%80%ED%99%94+%EC%9E%90%EB%A3%8C+%EC%88%98%EC%A7%91+%EB%B0%8F+%EB%A7%90%EB%AD%89%EC%B9%98+%EA%B5%AC%EC%B6%95+%EC%B5%9C%EC%A2%85+%EB%B3%B4%EA%B3%A0%EC%84%9C(%EC%88%98%EC%A0%95).pdf)
- K02 König, [Sequential patterns in SMS and WhatsApp dialogues](https://journals.sagepub.com/doi/full/10.1177/1750481319868853)
- K03 김지영, [카카오톡 대화에 나타나는 한국어 대화구조와 상호작용의 원리](https://dl.nanet.go.kr/detail/KDMT12021000047535)
- K04 양명희 외, [대학생의 카카오톡 언어 사용 분석](https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002177446)
- K05 Huang et al., [It Doesn't Hurt to Ask: Question-Asking Increases Liking](https://pmc.ncbi.nlm.nih.gov/articles/PMC6857721/)
