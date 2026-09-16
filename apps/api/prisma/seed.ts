import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.case.upsert({
    where: { id: '10000000-0000-4000-8000-000000000001' },
    update: {}, // Never silently change the truth of an existing case/session.
    create: {
      id: '10000000-0000-4000-8000-000000000001',
      title: '바다거북 수프',
      question: '한 남자가 식당에서 바다거북 수프를 한 입 먹고 집에 돌아가 자살했다. 왜일까?',
      maxQuestionCount: 30,
      story: {
        truth: '남자는 과거 다른 사람들과 조난당했다. 식량이 떨어지자 동료들은 이미 죽은 사람의 고기로 음식을 만들고 바다거북 고기라고 속여 남자에게 먹였다. 남자는 누구도 직접 살해하지 않았고 그 음식을 바다거북 고기라고 믿었다. 구조된 뒤 식당에서 진짜 바다거북 수프를 먹었는데 과거의 음식과 맛이 달랐다. 그는 당시 먹은 것이 사람의 고기였고 자신이 속았다는 진실을 깨달았다. 그 충격과 죄책감으로 집에 돌아가 자살했다.',
        facts: [
          '남자는 과거 다른 사람들과 조난당했다.',
          '동료들은 이미 죽은 사람의 고기로 음식을 만들었다.',
          '동료들은 그것을 바다거북 고기라고 속여 남자에게 제공했다.',
          '남자는 당시 사람의 고기인 줄 모르고 먹었다.',
          '남자는 사람을 직접 살해하지 않았다.',
          '식당의 수프는 진짜 바다거북 수프였다.',
          '맛의 차이로 남자는 과거 사람의 고기를 먹었다는 진실을 깨달았다.',
          '남자는 충격과 죄책감으로 자살했다.',
        ],
        requiredFacts: [
          { code: 'SHIPWRECK', description: '남자는 과거 조난당했다.' },
          { code: 'HUMAN_MEAT', description: '남자는 당시 사람의 고기를 먹었다.' },
          { code: 'DECEPTION', description: '그 음식은 바다거북 고기라고 속여 제공되었다.' },
          { code: 'REALIZATION', description: '진짜 바다거북 수프를 먹으며 과거의 진실을 깨달았다.' },
        ],
      },
    },
  });
}
main().finally(() => prisma.$disconnect()).catch(() => { console.error('Seed failed. Check database configuration.'); process.exitCode = 1; });
