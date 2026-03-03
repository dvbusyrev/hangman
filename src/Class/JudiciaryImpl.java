package Class;
import java.util.List;
import Interface.*;

public class JudiciaryImpl implements Judiciary{
    @Override
    public boolean pickWord(){return true;};
    @Override
    public boolean isCorrectLetter(char letter){return true;};
    @Override
    public String getWordWithLetters(Player player){return new String();};
    @Override
    public boolean isCorrectWord(Player player){return true;};
    @Override
    public String giveVerdict(Player player){return new String();};
}
