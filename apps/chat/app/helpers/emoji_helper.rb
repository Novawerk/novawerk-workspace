module EmojiHelper
  # Novawerk Chat: the quick reactions from the design (message menu, phone sheet, composer).
  REACTIONS = {
    "👍" => "Thumbs up",
    "❤️" => "Heart",
    "🎉" => "Party",
    "😂" => "Laugh",
    "👀" => "Eyes",
    "🔥" => "Fire"
  }

  # The reaction picker (RoomStates · I) and the composer's emoji button: common emoji with words
  # to search by.
  PICKER = REACTIONS.merge(
    "🙏" => "Thanks pray please",
    "✅" => "Done check yes",
    "💡" => "Idea bulb",
    "🚀" => "Rocket ship launch",
    "😅" => "Sweat phew",
    "🤔" => "Thinking hmm",
    "👏" => "Clap applause",
    "💚" => "Green heart",
    "⭐" => "Star",
    "😮" => "Wow surprised",
    "😊" => "Smile happy",
    "🙂" => "Slight smile",
    "😍" => "Love eyes",
    "🥳" => "Celebrate party",
    "😎" => "Cool sunglasses",
    "🤝" => "Handshake deal",
    "👋" => "Wave hello hi bye",
    "💪" => "Strong muscle",
    "🙌" => "Hooray raised hands",
    "👌" => "Ok okay",
    "✨" => "Sparkles shiny",
    "💯" => "Hundred perfect",
    "⚡" => "Lightning fast",
    "🐛" => "Bug",
    "🔧" => "Fix wrench tool",
    "📌" => "Pin",
    "📝" => "Note memo write",
    "📦" => "Package ship release",
    "🧪" => "Test experiment",
    "❓" => "Question",
    "❗" => "Exclamation important",
    "⚠️" => "Warning",
    "❌" => "No cross wrong",
    "👎" => "Thumbs down",
    "😢" => "Sad cry",
    "😬" => "Grimace awkward",
    "🫡" => "Salute",
    "☕" => "Coffee",
    "🍕" => "Pizza",
    "🌱" => "Seedling grow",
    "🎯" => "Target goal",
    "🏁" => "Finish flag"
  ).freeze
end
