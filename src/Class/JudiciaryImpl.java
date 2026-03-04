package Class;
import Interface.*;

public class JudiciaryImpl implements Judiciary {

    @Override
    public boolean pickWord(){return true;};

    @Override
    public boolean isCorrectLetter(char letter){return true;};

    @Override
    public String getWordWithLetters(Man man){return new String();};

    @Override
    public boolean isCorrectWord(Man man){return true;};

    @Override
    public String giveVerdict(Man man){return new String();};

}
