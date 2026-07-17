'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nhcqiflupqkugixybnhk.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oY3FpZmx1cHFrdWdpeHlibmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyOTI3NDIsImV4cCI6MjA5OTg2ODc0Mn0.RTmlE4eHR0upoK82nopKjaoB1ChfJFSlGquaD9etFCc';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface Plan {
  id: string;
  title: string;
  description: string;
  target_date: string;
  location: string;
  max_participants: number;
  min_participants?: number;
  deadline: string;
  current_count: number;
  is_established: boolean;
  members: string[];
}

export default function Home() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showModal, setShowModal] = useState(false);
  
  const [userName, setUserName] = useState<string>('');
  const [isRegistered, setIsRegistered] = useState<boolean>(false);
  const [inputName, setInputName] = useState<string>('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [location, setLocation] = useState('');
  const [minParticipants, setMinParticipants] = useState<number>(2);
  const [maxParticipants, setMaxParticipants] = useState<string>('');
  const [deadline, setDeadline] = useState('');

  const [myJoinedPlanIds, setMyJoinedPlanIds] = useState<string[]>([]);
  const [myNameHistory, setMyNameHistory] = useState<string[]>([]);

  useEffect(() => {
    const savedName = localStorage.getItem('user_board_name');
    if (savedName && savedName.trim() !== '') {
      const activeName = savedName.trim();
      setUserName(activeName);
      setIsRegistered(true);
      
      const savedJoined = localStorage.getItem('user_joined_plans');
      if (savedJoined) {
        setMyJoinedPlanIds(JSON.parse(savedJoined));
      }
      
      const savedHistory = localStorage.getItem('user_name_history');
      if (savedHistory) {
        setMyNameHistory(JSON.parse(savedHistory));
      } else {
        setMyNameHistory([activeName]);
      }
      
      fetchPlans(activeName);
    } else {
      handleLogoutUser();
    }
  }, []);

  const fetchPlans = async (currentUserName?: string) => {
    const activeName = currentUserName || userName;
    if (!activeName || activeName.trim() === '') return;

    const { data: plansData, error: plansError } = await supabase
      .from('plans')
      .select('*');
      
    if (plansError) {
      console.error(plansError);
      return;
    }

    const { data: participantsData, error: partError } = await supabase
      .from('participants')
      .select('*');

    if (partError) {
      console.error(partError);
      return;
    }

    // ローカルストレージ内の過去の参加ID履歴をベースにするため、ここではDBとの強制的な全消去による同期はせず、
    // DB側に自分の現在の名前があれば履歴をマージする形に補強します
    const savedJoined = localStorage.getItem('user_joined_plans');
    const localJoinedIds: string[] = savedJoined ? JSON.parse(savedJoined) : [];
    const realJoinedIds = [...localJoinedIds];

    const formattedPlans = (plansData || []).map((plan: any) => {
      const membersList = (participantsData || [])
        .filter((p: any) => p.plan_id === plan.id && p.user_name && p.user_name.trim() !== '')
        .map((p: any) => p.user_name.trim());
      
      // DB側に現在の名前、または過去の名前のいずれかが残っていれば、参加済みリストに確実に登録
      const hasAnyNameInDb = membersList.some(m => m === activeName || myNameHistory.includes(m));
      if (hasAnyNameInDb && !realJoinedIds.includes(plan.id)) {
        realJoinedIds.push(plan.id);
      }

      const isTimeOut = new Date() > new Date(plan.deadline);
      const isFull = plan.max_participants > 0 && membersList.length >= plan.max_participants;
      const hasMinPeople = membersList.length >= (plan.min_participants || 2);
      const isEstablishedNow = plan.is_established || ((isTimeOut || isFull) && hasMinPeople);

      return {
        ...plan,
        current_count: membersList.length,
        members: membersList,
        is_established: isEstablishedNow
      };
    });

    setMyJoinedPlanIds(realJoinedIds);
    localStorage.setItem('user_joined_plans', JSON.stringify(realJoinedIds));
    setPlans(formattedPlans as Plan[]);
  };

  const handleRegisterUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;
    const newName = inputName.trim();
    
    const savedHistory = localStorage.getItem('user_name_history');
    let updatedHistory = savedHistory ? JSON.parse(savedHistory) : [];
    if (!updatedHistory.includes(newName)) {
      updatedHistory.push(newName);
    }
    
    localStorage.setItem('user_board_name', newName);
    localStorage.setItem('user_name_history', JSON.stringify(updatedHistory));
    
    setUserName(newName);
    setMyNameHistory(updatedHistory);
    setIsRegistered(true);
    fetchPlans(newName);
  };

  // 【修正】名前の変更時、多重参加を防ぐために「参加した企画のID（user_joined_plans）」は絶対に消さずに残す！！
  const handleLogoutUser = () => {
    localStorage.removeItem('user_board_name');
    setUserName('');
    setIsRegistered(false);
    setInputName('');
    setPlans([]);
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName || userName.trim() === '') return;
    if (!title || !deadline || !minParticipants) {
      alert('必須項目（企画名・最低人数・募集期限）を入力してください');
      return;
    }

    const formattedDate = targetDate ? new Date(targetDate).toLocaleString('ja-JP') : '未定（メンバーで調整）';
    const maxNum = maxParticipants ? Number(maxParticipants) : 0;

    const secureDescription = `${description}\n\n[owner:${userName}]`;

    const { data: planData, error: planError } = await supabase
      .from('plans')
      .insert([{
        title,
        description: secureDescription,
        target_date: formattedDate,
        location: location || '未定',
        max_participants: maxNum,
        min_participants: minParticipants,
        deadline: new Date(deadline).toISOString()
      }])
      .select()
      .single();

    if (planError) {
      alert('エラーが発生しました: ' + planError.message);
      return;
    }

    await supabase
      .from('participants')
      .insert([{ plan_id: planData.id, user_name: userName }]);

    // 自分が作った企画も、当然参加済みIDに加える
    const updatedJoined = [...myJoinedPlanIds, planData.id];
    setMyJoinedPlanIds(updatedJoined);
    localStorage.setItem('user_joined_plans', JSON.stringify(updatedJoined));

    setShowModal(false);
    setTitle('');
    setDescription('');
    setTargetDate('');
    setLocation('');
    setDeadline('');
    setMinParticipants(2);
    setMaxParticipants('');
    
    await fetchPlans();
  };

  const getPlanOwner = (planDescription: string): string => {
    const match = planDescription.match(/\[owner:(.*?)\]$/);
    return match ? match[1] : '';
  };

  const getCleanDescription = (planDescription: string): string => {
    return planDescription.replace(/\n\n\[owner:.*?\]$/, '');
  };

  const handleToggleJoin = async (plan: Plan) => {
    if (!userName || userName.trim() === '') return;

    const creatorName = getPlanOwner(plan.description);
    const isCreator = myNameHistory.includes(creatorName) || userName === creatorName || creatorName === '';
    const isMember = myJoinedPlanIds.includes(plan.id);

    if (isCreator && creatorName !== '') {
      alert('企画者は参加を取り消せません。企画をやめる場合は右上の「削除」を行ってください。');
      return;
    }

    if (isMember) {
      if (!confirm('この企画への参加を取り消しますか？')) return;

      // 【修正】過去の名前、あるいは現在の名前、データベースに残っている方を柔軟に削除ターゲットにする
      // 基本的には現在のuserName、見つからなければ過去の履歴に一致するものをDBから消去
      const targetDeleteName = plan.members.find(m => m === userName) || plan.members.find(m => myNameHistory.includes(m)) || userName;

      const { error } = await supabase
        .from('participants')
        .delete()
        .eq('plan_id', plan.id)
        .eq('user_name', targetDeleteName);

      if (error) {
        alert('キャンセルの処理に失敗しました: ' + error.message);
      } else {
        const updatedJoined = myJoinedPlanIds.filter(id => id !== plan.id);
        setMyJoinedPlanIds(updatedJoined);
        localStorage.setItem('user_joined_plans', JSON.stringify(updatedJoined));
        await fetchPlans();
      }
    } else {
      if (plan.max_participants > 0 && plan.current_count >= plan.max_participants) {
        alert('申し訳ありません。この企画はすでに最高人数に達しているため参加できません。');
        return;
      }

      const { error } = await supabase
        .from('participants')
        .insert([{ plan_id: plan.id, user_name: userName }]);

      if (error) {
        if (error.code === '23505') {
          alert('すでにこの企画に参加しています');
        } else {
          alert('参加に失敗しました: ' + error.message);
        }
      } else {
        const updatedJoined = [...myJoinedPlanIds, plan.id];
        setMyJoinedPlanIds(updatedJoined);
        localStorage.setItem('user_joined_plans', JSON.stringify(updatedJoined));
        await fetchPlans();
      }
    }
  };

  const handleDeletePlan = async (plan: Plan) => {
    const creatorName = getPlanOwner(plan.description);
    const isCreator = myNameHistory.includes(creatorName) || userName === creatorName || creatorName === '';

    if (!isCreator && creatorName !== '') {
      alert('企画者（発案者）以外はこの企画を削除できません！');
      return;
    }

    if (!confirm('この企画を削除してもよろしいですか？（元には戻せません）')) return;

    const { error } = await supabase
      .from('plans')
      .delete()
      .eq('id', plan.id);

    if (error) {
      alert('削除に失敗しました: ' + error.message);
    } else {
      await fetchPlans();
    }
  };

  if (!isRegistered || !userName || userName.trim() === '') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-md max-w-md w-full p-6 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">利用登録</h2>
          <p className="text-sm text-gray-500 mb-6">アプリ内で使用するあなたの名前を入力してください。</p>
          <form onSubmit={handleRegisterUser} className="space-y-4">
            <input 
              type="text" 
              required 
              value={inputName} 
              onChange={(e) => setInputName(e.target.value)} 
              className="w-full border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
              placeholder="例: 太郎" 
            />
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-lg text-sm transition">
              登録してはじめる
            </button>
          </form>
        </div>
      </div>
    );
  }

  const activePlans = plans.filter(plan => {
    const isFull = plan.max_participants > 0 && plan.current_count >= plan.max_participants;
    const isTimeOut = new Date() > new Date(plan.deadline);
    return !isFull && !isTimeOut && !plan.is_established;
  });

  const closedPlans = plans.filter(plan => {
    const isFull = plan.max_participants > 0 && plan.current_count >= plan.max_participants;
    const isTimeOut = new Date() > new Date(plan.deadline);
    return isFull || isTimeOut || plan.is_established;
  });

  const renderPlanCard = (plan: Plan) => {
    const limitText = plan.max_participants > 0 ? `${plan.max_participants}人` : 'なし';
    const isFull = plan.max_participants > 0 && plan.current_count >= plan.max_participants;
    const isTimeOut = new Date() > new Date(plan.deadline);
    
    const creatorName = getPlanOwner(plan.description) || plan.members[0] || '不明';
    const displayedCreator = plan.is_established ? creatorName : '匿名';

    const isCreator = myNameHistory.includes(creatorName) || userName === creatorName;
    const isMember = myJoinedPlanIds.includes(plan.id);

    const cleanDesc = getCleanDescription(plan.description);

    return (
      <div key={plan.id} className={`bg-white rounded-xl shadow-md p-6 border flex flex-col justify-between ${plan.is_established ? 'border-green-400 bg-green-50/20' : 'border-gray-200'}`}>
        <div>
          <div className="flex justify-between items-start mb-4">
            <span className="text-sm font-semibold text-gray-400">企画者: {displayedCreator}</span>
            <div className="flex items-center gap-2">
              {plan.is_established ? (
                <span className="bg-green-500 text-white text-xs px-2.5 py-1 rounded-full font-bold">企画成立</span>
              ) : (isFull || isTimeOut) ? (
                <span className="bg-gray-400 text-white text-xs px-2.5 py-1 rounded-full font-bold">募集終了</span>
              ) : (
                <span className="bg-amber-500 text-white text-xs px-2.5 py-1 rounded-full font-bold">募集中</span>
              )}
              {isCreator && (
                <button 
                  onClick={() => handleDeletePlan(plan)}
                  className="text-gray-400 hover:text-red-500 text-xs p-1 transition font-medium"
                  title="企画を削除"
                >
                  削除
                </button>
              )}
            </div>
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-2">{plan.title}</h2>
          <p className="text-gray-600 text-sm mb-4 whitespace-pre-wrap">{cleanDesc}</p>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm mb-4">
            <div>日時: {plan.target_date}</div>
            <div>場所: {plan.location}</div>
            <div>最低人数: {plan.min_participants || 2}人（現在 {plan.current_count}人）</div>
            <div>最高人数制限: {limitText}</div>
            <div>期限: {new Date(plan.deadline).toLocaleString('ja-JP')}</div>
          </div>

          <div className="mb-4">
            {plan.is_established ? (
              <>
                <div className="text-xs font-bold text-gray-400 mb-1">現在の参加メンバー:</div>
                <div className="flex flex-wrap gap-1.5">
                  {plan.members.map((member, idx) => (
                    <span 
                      key={idx} 
                      className={`text-xs px-2 py-1 rounded ${
                        member === creatorName ? 'bg-indigo-100 text-indigo-700 font-medium' : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {member} {member === creatorName && '👑'}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-xs font-semibold text-gray-400 bg-gray-100 inline-block px-3 py-1.5 rounded-md">
                🔒 メンバー情報は企画成立後に公開されます（現在 {plan.current_count}人が参加中）
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          {plan.is_established ? (
            <div className="text-center bg-green-600 text-white font-bold py-3 px-4 rounded-lg shadow">
              企画が成立しました。メンバー間で連絡を確認してください。
            </div>
          ) : (isFull || isTimeOut) ? (
            <div className="text-center bg-gray-100 text-gray-400 text-sm font-medium py-2.5 rounded-lg border border-gray-200">
              この募集は締め切られました
            </div>
          ) : isCreator ? (
            <div className="text-center bg-gray-100 text-gray-500 text-sm font-medium py-2.5 rounded-lg border border-dashed">
              参加申込み済みです（企画者）
            </div>
          ) : isMember ? (
            <button 
              onClick={() => handleToggleJoin(plan)}
              className="w-full bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium py-2.5 rounded-lg border border-red-200 transition"
            >
              参加を取り消す（キャンセル）
            </button>
          ) : (
            <button 
              onClick={() => handleToggleJoin(plan)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg transition"
            >
              この企画に参加する
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 p-6">
      <header className="max-w-5xl mx-auto flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-indigo-600">企画ボード</h1>
          <p className="text-xs text-gray-500 mt-1">
            ログイン中: <span className="font-semibold text-gray-700">{userName}</span>
            <button onClick={handleLogoutUser} className="ml-2 text-indigo-500 hover:underline text-[10px]">名前を変更</button>
          </p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg shadow"
        >
          企画を発案する
        </button>
      </header>

      <main className="max-w-5xl mx-auto space-y-12">
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b-2 border-indigo-500 inline-block">現在募集中の企画</h2>
          {activePlans.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 bg-white text-center rounded-xl border border-dashed">現在募集中の企画はありません。</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activePlans.map(renderPlanCard)}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-bold text-gray-500 mb-4 pb-2 border-b-2 border-gray-400 inline-block">終了・成立した企画</h2>
          {closedPlans.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 bg-white text-center rounded-xl border border-dashed">過去の企画はありません。</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-85">
              {closedPlans.map(renderPlanCard)}
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">新しい企画をつくる</h3>
            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">企画名 *</label>
                <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded-lg p-2 text-sm" placeholder="例: 鬼ごっこ" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">詳細（やりたいこと、参加費など）</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border rounded-lg p-2 text-sm h-20" placeholder="本気で鬼ごっこをしましょう!参加費無料。" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">実施日時(空欄で未定)</label>
                  <input type="datetime-local" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="w-full border rounded-lg p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">場所（空欄で未定）</label>
                  <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full border rounded-lg p-2 text-sm" placeholder="例: 豊島野公園" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">最低人数 *</label>
                  <input type="number" min={2} required value={minParticipants} onChange={(e) => setMinParticipants(Number(e.target.value))} className="w-full border rounded-lg p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">最高人数（空欄で制限なし）</label>
                  <input type="number" min={minParticipants} value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} className="w-full border rounded-lg p-2 text-sm" placeholder="制限なし" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">募集期限 *</label>
                <input type="datetime-local" required value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-2 px-4 rounded-lg text-sm">キャンセル</button>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg text-sm">公開する</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}