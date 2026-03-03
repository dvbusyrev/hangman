package Interface;
import java.util.List;

public interface Judiciary {
    boolean pickWord();
    boolean isCorrectLetter(char letter);
    String getWordWithLetters(Player player);
    boolean isCorrectWord(Player player);
    String giveVerdict(Player player);
}
