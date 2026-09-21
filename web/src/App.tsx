import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Ask from "./pages/Ask";
import Compare from "./pages/Compare";
import Documents from "./pages/Documents";
import Overview from "./pages/Overview";
import QuestionDetail from "./pages/QuestionDetail";
import Questions from "./pages/Questions";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/ask" replace />} />
        <Route path="/ask" element={<Ask />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/quality" element={<Overview />} />
        <Route path="/quality/compare" element={<Compare />} />
        <Route path="/quality/questions" element={<Questions />} />
        <Route path="/quality/runs/:runId/questions/:qid" element={<QuestionDetail />} />
        <Route path="*" element={<Navigate to="/ask" replace />} />
      </Route>
    </Routes>
  );
}
