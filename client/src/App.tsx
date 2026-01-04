import { useState, useRef, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

interface Message {
  sender: "user" | "bot";
  text: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

const INITIAL_MESSAGE: Message = {
  sender: "bot",
  text: "Greetings, seeker of perfect harmony. I am **The Alchemist**, a master of sensory alchemy. I craft the ideal pairing of cocktail and perfume, tailored to your essence.\n\nTell me, what stirs within you today?",
};

function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem("alchemy-conversations");
    return saved ? JSON.parse(saved) : [];
  });
  const [currentConversationId, setCurrentConversationId] = useState<string>(
    () => {
      const saved = localStorage.getItem("alchemy-current-id");
      return saved || "";
    }
  );
  const [messages, setMessages] = useState<Message[]>(() => {
    if (currentConversationId) {
      const conv = conversations.find((c) => c.id === currentConversationId);
      return conv?.messages || [INITIAL_MESSAGE];
    }
    return [INITIAL_MESSAGE];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [messages]);

  // Save conversations to localStorage
  useEffect(() => {
    localStorage.setItem(
      "alchemy-conversations",
      JSON.stringify(conversations)
    );
  }, [conversations]);

  useEffect(() => {
    if (currentConversationId) {
      localStorage.setItem("alchemy-current-id", currentConversationId);
    }
  }, [currentConversationId]);

  const generateConversationTitle = (firstUserMessage: string): string => {
    const words = firstUserMessage.trim().split(/\s+/);
    if (words.length <= 5) return firstUserMessage;
    return words.slice(0, 5).join(" ") + "...";
  };

  const createNewConversation = () => {
    const newId = `conv-${Date.now()}`;
    const newConv: Conversation = {
      id: newId,
      title: "New Conversation",
      messages: [INITIAL_MESSAGE],
      createdAt: Date.now(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setCurrentConversationId(newId);
    setMessages([INITIAL_MESSAGE]);
  };

  const switchConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      // Save current conversation before switching
      if (currentConversationId) {
        updateConversation(currentConversationId, messages);
      }
      setCurrentConversationId(id);
      setMessages(conv.messages);
    }
  };

  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated);
    if (currentConversationId === id) {
      if (updated.length > 0) {
        switchConversation(updated[0].id);
      } else {
        setCurrentConversationId("");
        setMessages([INITIAL_MESSAGE]);
      }
    }
  };

  const updateConversation = (id: string, newMessages: Message[]) => {
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === id) {
          const firstUserMsg = newMessages.find((m) => m.sender === "user");
          const title =
            firstUserMsg && conv.title === "New Conversation"
              ? generateConversationTitle(firstUserMsg.text)
              : conv.title;
          return { ...conv, messages: newMessages, title };
        }
        return conv;
      })
    );
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    let convId = currentConversationId;

    // Create conversation if it doesn't exist
    if (!convId) {
      convId = `conv-${Date.now()}`;
      const newConv: Conversation = {
        id: convId,
        title: generateConversationTitle(userMessage),
        messages: [INITIAL_MESSAGE],
        createdAt: Date.now(),
      };
      setConversations((prev) => [newConv, ...prev]);
      setCurrentConversationId(convId);
    }

    // Add user message immediately
    const userMsg = { sender: "user" as const, text: userMessage };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await axios.post("http://localhost:3000/api/chat", {
        sessionId: convId,
        message: userMessage,
      });

      const botMessage = { sender: "bot" as const, text: response.data.text };
      const finalMessages = [...updatedMessages, botMessage];
      setMessages(finalMessages);
      updateConversation(convId, finalMessages);
    } catch (error) {
      console.error(error);
      const errorMessage = {
        sender: "bot" as const,
        text: "Apologies, the spirits are quiet right now (Server Error).",
      };
      const finalMessages = [...updatedMessages, errorMessage];
      setMessages(finalMessages);
      updateConversation(convId!, finalMessages);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-container">
            <img src="/logo.png" alt="The Alchemist" className="sidebar-logo" />
            <div className="logo-glow"></div>
          </div>
        </div>
        <button className="new-chat-btn" onClick={createNewConversation}>
          <span className="new-chat-icon">+</span>
          <span>New Chat</span>
        </button>

        <div className="conversations-section">
          <h3 className="conversations-title">Conversations</h3>
          <div className="conversations-list">
            {conversations.length === 0 ? (
              <div className="no-conversations">
                No conversations yet. Start a new chat to begin.
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`conversation-item ${
                    currentConversationId === conv.id ? "active" : ""
                  }`}
                  onClick={() => switchConversation(conv.id)}
                >
                  <span className="conversation-title">{conv.title}</span>
                  <button
                    className="delete-conv-btn"
                    onClick={(e) => deleteConversation(conv.id, e)}
                    title="Delete conversation"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      <div className="chat-container">
        <header className="chat-header">
          <h1>The Alchemist</h1>
        </header>

        <div className="messages-area">
          <div className="messages-container">
            {messages.map((msg, idx) => (
              <div key={idx} className={`message-bubble ${msg.sender}`}>
                {msg.sender === "bot" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.text}
                  </ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>
            ))}
            {loading && (
              <div className="message-bubble bot typing">
                <span>⚗️ Mixing the perfect blend...</span>
              </div>
            )}
          </div>
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <div className="input-container">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && sendMessage()}
              placeholder="Share your mood, personality or desires..."
              disabled={loading}
            />
            <button onClick={sendMessage} disabled={loading || !input.trim()}>
              {loading ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
