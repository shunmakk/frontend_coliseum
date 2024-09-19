import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Difficulty, Question } from "../../types";
import Modal from "../../Components/Modal";
import { auth, db } from "../../firebase";
import { doc, increment, updateDoc, getDoc } from "firebase/firestore";
import LoadingOrError from "../../Components/LoadingOrError";

const QUIZ_STATE_KEY = "quizState";

interface QuizState {
  questions: (Question & { userAnswer?: number })[];
  currentQuestionIndex: number;
  score: number;
  difficulty: Difficulty;
}

const Quiz: React.FC = () => {
  const { difficulty } = useParams<{ difficulty: Difficulty }>();
  const navigate = useNavigate();
  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  const fetchQuestions = useCallback(async () => {
    try {
      const response = await fetch(`/api/questions/${difficulty}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
      });
      if (response.ok) {
        const questions = await response.json();
        setQuizState({
          questions,
          currentQuestionIndex: 0,
          score: 0,
          difficulty: difficulty as Difficulty,
        });
      } else {
        console.error("questionsのフェッチに失敗しました");
      }
    } catch (error) {
      console.error("questionsのフェッチ周りのエラー", error);
    }
  }, [difficulty]);

  const recoverQuizState = (savedState: QuizState): QuizState => {
    const recoveredScore = savedState.questions.reduce((score, question) => {
      if (question.userAnswer === question.correctAnswer) {
        return score + 1;
      }
      return score;
    }, 0);

    return {
      ...savedState,
      score: recoveredScore,
    };
  };

  useEffect(() => {
    const savedState = localStorage.getItem(QUIZ_STATE_KEY);
    if (savedState && JSON.parse(savedState).difficulty === difficulty) {
      const parsedState = JSON.parse(savedState);
      setQuizState(recoverQuizState(parsedState));
    } else {
      localStorage.removeItem(QUIZ_STATE_KEY);
      fetchQuestions();
    }
  }, [fetchQuestions, difficulty]);

  useEffect(() => {
    if (quizState) {
      localStorage.setItem(QUIZ_STATE_KEY, JSON.stringify(quizState));
    }
  }, [quizState]);

  const handleAnswer = (selectedAnswer: number) => {
    if (!quizState) return;

    const currentQuestion = quizState.questions[quizState.currentQuestionIndex];

    if (currentQuestion.userAnswer !== undefined) {
      console.log("既に回答済み");
      return;
    }

    const correct = selectedAnswer === currentQuestion.correctAnswer;
    setIsCorrect(correct);
    setShowModal(true);
    setQuizState((prevState) => {
      if (!prevState) return null;
      const newQuestions = [...prevState.questions];
      newQuestions[prevState.currentQuestionIndex] = {
        ...currentQuestion,
        userAnswer: selectedAnswer,
      };
      return {
        ...prevState,
        questions: newQuestions,
        score: correct ? prevState.score + 1 : prevState.score,
      };
    });
  };

  const nextQuestion = () => {
    setShowModal(false);
    setShowExplanation(false);
    setQuizState((prevState) => {
      if (!prevState) return null;
      const nextIndex = prevState.currentQuestionIndex + 1;
      if (nextIndex >= prevState.questions.length) {
        handleComplete();
        return prevState;
      }
      return {
        ...prevState,
        currentQuestionIndex: nextIndex,
      };
    });
  };

  const identificationButton = () => {
    if (showExplanation === true) {
      setShowExplanation(false);
    } else {
      setShowExplanation(true);
    }
  };

  const handleComplete = async () => {
    if (!quizState) return;
    const user = auth.currentUser;
    if (user) {
      try {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        const userData = userDoc.data();
        const newTotalGames = (userData?.totalGames || 0) + 1;
        const newTotalScore = (userData?.totalScore || 0) + quizState.score;
        const newAverageScore = newTotalScore / newTotalGames;
        await updateDoc(userRef, {
          totalGames: increment(1),
          totalScore: increment(quizState.score),
          averageScore: newAverageScore,
        });
      } catch (error) {
        console.error("スコアのupdateに失敗しました", error);
      }
    }
    localStorage.removeItem(QUIZ_STATE_KEY);
    navigate("/complete", {
      state: { score: quizState.score, total: quizState.questions.length },
    });
  };

  if (!quizState) return <LoadingOrError />;

  const currentQuestion = quizState.questions[quizState.currentQuestionIndex];
  const isLastQuestion =
    quizState.currentQuestionIndex === quizState.questions.length - 1;

  return (
    <div>
      <h2>
        問題{quizState.currentQuestionIndex + 1}/{quizState.questions.length}
      </h2>
      <p>{currentQuestion?.text}</p>
      {currentQuestion?.options.map((option, index) => (
        <button
          key={index}
          onClick={() => handleAnswer(index)}
          disabled={currentQuestion.userAnswer !== undefined}
          style={{
            backgroundColor:
              currentQuestion.userAnswer === index
                ? index === currentQuestion.correctAnswer
                  ? "lightgreen"
                  : "lightcoral"
                : currentQuestion.userAnswer !== undefined &&
                  index === currentQuestion.correctAnswer
                ? "lightgreen"
                : "white",
          }}
        >
          {option}
        </button>
      ))}
      <Modal
        show={showModal}
        onClose={() => setShowExplanation(false)}
        explanation={false}
      >
        <h3>{isCorrect ? "正解！" : "不正解"}</h3>
        <p>
          {isCorrect
            ? isLastQuestion
              ? "これでクイズは終了です！"
              : "次の問題に進みましょう！"
            : `正解は: ${
                currentQuestion?.options[currentQuestion.correctAnswer]
              }`}
        </p>
        {!isLastQuestion && <button onClick={nextQuestion}>次の問題へ</button>}
        {isLastQuestion && (
          <button onClick={handleComplete}>リザルト画面へ</button>
        )}
        <button onClick={identificationButton}>
          {showExplanation ? "解説を閉じる" : "解説を見る"}
        </button>
      </Modal>
      <Modal show={showExplanation} onClose={nextQuestion} explanation={true}>
        <h3>解説</h3>
        <p>{currentQuestion?.explanation}</p>
      </Modal>
    </div>
  );
};

export default Quiz;
